const pool = require('../db');
const logger = require('../logger');

// Elo-style ratings on a logit scale (Pelánek 2016, "Applications of the Elo rating
// system in adaptive educational systems"). P(correct) = 1 / (1 + e^-(skill - difficulty));
// each answer moves skill and difficulty by K * (result - P), with K shrinking as a
// rating accumulates answers so early answers move it most.
const SEED_BY_LABEL = { easy: -0.5, medium: 0, hard: 0.5 };
const ANY = '*';

function expectedCorrect(skill, difficulty) {
  return 1 / (1 + Math.exp(-(skill - difficulty)));
}

function stepSize(answers) {
  return 1 / (1 + 0.05 * answers);
}

// Skill in an OA = the student's subject rating + an offset for that OA, so a
// student with few answers in an OA starts from how they do in the subject.
function rateAnswer({ subject, oa, question, correct }) {
  const skill = subject.rating + (oa ? oa.rating : 0);
  const expected = expectedCorrect(skill, question.rating);
  const surprise = (correct ? 1 : 0) - expected;
  return {
    expected,
    subject: subject.rating + stepSize(subject.answers) * surprise,
    oa: oa ? oa.rating + stepSize(oa.answers) * surprise : null,
    question: question.rating - stepSize(question.answers) * surprise,
  };
}

async function loadSkill(client, cache, studentId, subject, gradeLevel, oaCode) {
  const key = [studentId, subject, gradeLevel, oaCode].join('|');
  if (!cache.has(key)) {
    const { rows } = await client.query(
      `SELECT rating, answers, correct FROM student_skill_ratings
       WHERE student_id = $1 AND subject = $2 AND grade_level = $3 AND oa_code = $4`,
      [studentId, subject, gradeLevel, oaCode]
    );
    cache.set(key, {
      studentId, subject, gradeLevel, oaCode,
      rating: rows[0]?.rating ?? 0,
      answers: rows[0]?.answers ?? 0,
      correct: rows[0]?.correct ?? 0,
      lastAnsweredAt: null,
    });
  }
  return cache.get(key);
}

// Folds every answer not yet rated into the ratings, oldest first. Idempotent:
// each answer is marked rated_at in the same transaction that applies it.
async function rateUnratedAnswers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: answers } = await client.query(`
      SELECT a.id, a.student_id, a.is_correct, a.answered_at, s.is_test,
             q.id AS question_id, q.subject, q.grade_level, q.oa_code, q.difficulty, q.rating, q.rating_answers
      FROM student_answers a
      JOIN questions q ON q.id = a.question_id
      JOIN local_students s ON s.id = a.student_id
      WHERE a.rated_at IS NULL AND a.student_id IS NOT NULL
      ORDER BY a.answered_at, a.session_id, a.question_index
      FOR UPDATE OF a SKIP LOCKED
    `);
    if (!answers.length) {
      await client.query('COMMIT');
      return 0;
    }

    const questions = new Map();
    const skills = new Map();
    for (const a of answers) {
      if (!questions.has(a.question_id)) {
        questions.set(a.question_id, {
          rating: a.rating ?? SEED_BY_LABEL[a.difficulty] ?? 0,
          answers: a.rating_answers,
        });
      }
      const question = questions.get(a.question_id);
      const subject = await loadSkill(client, skills, a.student_id, a.subject, ANY, ANY);
      const oa = a.oa_code ? await loadSkill(client, skills, a.student_id, a.subject, a.grade_level, a.oa_code) : null;

      const next = rateAnswer({ subject, oa, question, correct: a.is_correct });
      // A tester answers on purpose right or wrong: their own ratings move, the question's don't.
      if (!a.is_test) {
        question.rating = next.question;
        question.answers += 1;
      }
      for (const [skill, rating] of [[subject, next.subject], [oa, next.oa]]) {
        if (!skill) continue;
        skill.rating = rating;
        skill.answers += 1;
        skill.correct += a.is_correct ? 1 : 0;
        skill.lastAnsweredAt = a.answered_at;
      }
    }

    for (const [id, q] of questions) {
      await client.query('UPDATE questions SET rating = $2, rating_answers = $3 WHERE id = $1', [id, q.rating, q.answers]);
    }
    for (const s of skills.values()) {
      if (!s.lastAnsweredAt) continue;
      await client.query(`
        INSERT INTO student_skill_ratings (student_id, subject, grade_level, oa_code, rating, answers, correct, last_answered_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (student_id, subject, grade_level, oa_code) DO UPDATE SET
          rating = EXCLUDED.rating, answers = EXCLUDED.answers, correct = EXCLUDED.correct,
          last_answered_at = EXCLUDED.last_answered_at
      `, [s.studentId, s.subject, s.gradeLevel, s.oaCode, s.rating, s.answers, s.correct, s.lastAnsweredAt]);
    }
    await client.query('UPDATE student_answers SET rated_at = NOW() WHERE id = ANY($1::uuid[])', [answers.map(a => a.id)]);
    await client.query('COMMIT');
    return answers.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// One pass at a time: two rounds ending together must not rate the same answers twice.
let queue = Promise.resolve();
function scheduleRating() {
  queue = queue
    .then(rateUnratedAnswers)
    .catch(err => logger.error({ err }, 'skill rating failed'));
  return queue;
}

// Worse than chance (4 options) with one wrong answer dominating: either the key
// is wrong or the class shares a misconception. A teacher has to look at it.
async function findSuspiciousQuestions({ minAnswers = 10 } = {}) {
  const { rows } = await pool.query(`
    WITH per_question AS (
      SELECT question_id, COUNT(*)::int AS answers, AVG(is_correct::int) AS pct_correct
      FROM student_answers WHERE question_id IS NOT NULL AND student_id NOT IN (SELECT id FROM local_students WHERE is_test)
      GROUP BY question_id HAVING COUNT(*) >= $1
    ), top_wrong AS (
      SELECT DISTINCT ON (question_id) question_id, answer, COUNT(*)::int AS times
      FROM student_answers WHERE question_id IS NOT NULL AND NOT is_correct
        AND student_id NOT IN (SELECT id FROM local_students WHERE is_test)
      GROUP BY question_id, answer
      ORDER BY question_id, COUNT(*) DESC
    )
    SELECT q.id, q.subject, q.grade_level, q.oa_code, q.text, q.correct,
           p.answers, ROUND(p.pct_correct * 100)::int AS pct_correct,
           w.answer AS top_wrong_answer, w.times AS top_wrong_times
    FROM per_question p
    JOIN questions q ON q.id = p.question_id
    JOIN top_wrong w ON w.question_id = p.question_id
    WHERE p.pct_correct < 0.25 AND w.times * 2 >= p.answers * (1 - p.pct_correct)
    ORDER BY p.pct_correct
  `, [minAnswers]);
  return rows;
}

module.exports = {
  expectedCorrect,
  rateAnswer,
  rateUnratedAnswers,
  scheduleRating,
  findSuspiciousQuestions,
  SEED_BY_LABEL,
};
