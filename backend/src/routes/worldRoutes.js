const express = require('express');
const pool = require('../db');
const logger = require('../logger');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const { inTransaction } = require('../db/transaction');
const { trackEvent } = require('../services/eventTracker');
const { deriveGradeLevel } = require('../services/gradeLevel');
const { pickForStudent } = require('../services/questionPicker');
const { scheduleRating } = require('../services/skillRatings');
const { levelAchievements } = require('../services/copihues');
const {
  getMap, findLevel, levelLabel, starsFor, LEVEL_QUESTIONS, CHALLENGE_QUESTIONS, MIN_QUESTIONS, STAR_BONUS,
} = require('../services/world');

const router = express.Router();
router.use(authenticateToken, requireStudent);

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function studentGrade(studentId) {
  const { rows } = await pool.query('SELECT course_name FROM local_students WHERE id = $1', [studentId]);
  return deriveGradeLevel(rows[0]?.course_name);
}

async function credit(client, studentId, amount, reason) {
  if (amount <= 0) return;
  await client.query('UPDATE local_students SET tokens_balance = tokens_balance + $2 WHERE id = $1', [studentId, amount]);
  await client.query('INSERT INTO token_ledger (student_id, amount, reason) VALUES ($1, $2, $3)', [studentId, amount, reason]);
}

// Locks the attempt and checks it belongs to the student and is waiting for answer `index`.
async function lockAttempt(client, attemptId, studentId, index) {
  const { rows } = await client.query(
    'SELECT * FROM practice_attempts WHERE id = $1 AND student_id = $2 FOR UPDATE',
    [attemptId, studentId]
  );
  const attempt = rows[0];
  if (!attempt) return { status: 404, body: { error: 'Nivel no encontrado' } };
  if (attempt.finished_at || index !== attempt.answered) {
    return { status: 409, body: { error: 'Esa pregunta ya se respondió', code: 'out_of_order' } };
  }
  return { attempt };
}

router.get('/:subject', async (req, res) => {
  try {
    const gradeLevel = await studentGrade(req.user.id);
    const worldMap = gradeLevel && await getMap(req.user.id, gradeLevel, req.params.subject);
    if (!worldMap) return res.status(404).json({ error: 'Tu curso aún no tiene este mapa' });
    const { rows } = await pool.query('SELECT tokens_balance FROM local_students WHERE id = $1', [req.user.id]);
    res.json({ ...worldMap, tokens: rows[0]?.tokens_balance ?? 0 });
  } catch (err) {
    logger.error({ err }, 'world map error');
    res.status(500).json({ error: 'Error al cargar el mapa' });
  }
});

router.post('/:subject/levels/:key/start', async (req, res) => {
  const { subject, key } = req.params;
  try {
    const gradeLevel = await studentGrade(req.user.id);
    const worldMap = gradeLevel && await getMap(req.user.id, gradeLevel, subject);
    const level = worldMap && findLevel(worldMap, key);
    if (!level) return res.status(404).json({ error: 'Nivel no encontrado' });
    if (level.state === 'locked') return res.status(403).json({ error: 'Completa el nivel anterior para abrir este', code: 'locked' });
    if (level.state === 'preparing') return res.status(409).json({ error: 'Este nivel aún no tiene preguntas', code: 'preparing' });

    const questions = await pickForStudent({
      studentId: req.user.id,
      subject,
      gradeLevel,
      oaCodes: level.oaCodes,
      count: level.isChallenge ? CHALLENGE_QUESTIONS : LEVEL_QUESTIONS,
      onePerOa: level.isChallenge,
    });
    if (questions.length < MIN_QUESTIONS) return res.status(409).json({ error: 'Este nivel aún no tiene preguntas', code: 'preparing' });

    const payByOa = new Map(worldMap.islands.flatMap(i => i.levels).map(l => [l.oa, l.pay]));
    const shown = questions.map(q => ({ id: q.id, options: shuffle(q.options), pay: payByOa.get(q.oa_code) ?? 1 }));
    const { rows } = await pool.query(
      `INSERT INTO practice_attempts (student_id, subject, grade_level, level_key, questions)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, subject, gradeLevel, key, JSON.stringify(shown)]
    );
    trackEvent({ actorType: 'student', actorId: req.user.id, eventType: 'level_started', payload: { subject, gradeLevel, key } });
    res.status(201).json({
      attemptId: rows[0].id,
      level: { key, label: level.label, isChallenge: level.isChallenge, stars: level.stars, pay: level.pay },
      questions: questions.map((q, i) => ({ text: q.text, options: shown[i].options })),
    });
  } catch (err) {
    logger.error({ err }, 'level start error');
    res.status(500).json({ error: 'Error al empezar el nivel' });
  }
});

router.post('/attempts/:id/answer', async (req, res) => {
  const { index, answer, timeMs } = req.body || {};
  if (!Number.isInteger(index) || typeof answer !== 'string') return res.status(400).json({ error: 'Respuesta inválida' });

  try {
    const result = await inTransaction(async client => {
      const locked = await lockAttempt(client, req.params.id, req.user.id, index);
      if (!locked.attempt) return locked;
      const { attempt } = locked;
      const shown = attempt.questions[index];
      if (!shown.options.includes(answer)) return { status: 400, body: { error: 'Esa alternativa no está en la pregunta' } };

      const { rows: [q] } = await client.query(
        'SELECT id, correct, hint, option_notes FROM questions WHERE id = $1',
        [shown.id]
      );
      if (!q) return { status: 410, body: { error: 'Esta pregunta se retiró del banco', code: 'question_gone' } };
      const correct = answer === q.correct;
      const { rows: before } = await client.query(
        'SELECT 1 FROM student_answers WHERE student_id = $1 AND question_id = $2 AND is_correct LIMIT 1',
        [req.user.id, q.id]
      );
      const tokens = correct && !before.length ? shown.pay : 0;

      await client.query(
        `INSERT INTO student_answers (student_id, question_index, answer, is_correct, time_taken_ms, question_id, attempt_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.user.id, index, answer, correct, Number.isInteger(timeMs) ? timeMs : null, q.id, attempt.id]
      );
      await credit(client, req.user.id, tokens, 'practice');

      const answered = attempt.answered + 1;
      const right = attempt.correct + (correct ? 1 : 0);
      let finished = null;
      let attemptTokens = attempt.tokens + tokens;
      if (answered === attempt.questions.length) {
        const stars = starsFor(right, answered);
        const { rows: prev } = await client.query(
          `SELECT stars FROM student_level_progress
           WHERE student_id = $1 AND subject = $2 AND grade_level = $3 AND level_key = $4`,
          [req.user.id, attempt.subject, attempt.grade_level, attempt.level_key]
        );
        const previousStars = prev[0]?.stars ?? 0;
        await client.query(
          `INSERT INTO student_level_progress (student_id, subject, grade_level, level_key, stars)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (student_id, subject, grade_level, level_key) DO UPDATE SET
             stars = GREATEST(student_level_progress.stars, EXCLUDED.stars),
             plays = student_level_progress.plays + 1, updated_at = NOW()`,
          [req.user.id, attempt.subject, attempt.grade_level, attempt.level_key, stars]
        );
        const isChallenge = attempt.level_key.startsWith('desafio-');
        const bonus = Math.max(0, stars - previousStars) * (isChallenge ? STAR_BONUS.challenge : STAR_BONUS.level);
        await credit(client, req.user.id, bonus, 'practice_stars');
        attemptTokens += bonus;
        finished = { stars, previousStars, correct: right, total: answered, bonus, tokens: attemptTokens };
      }
      await client.query(
        `UPDATE practice_attempts SET answered = $2, correct = $3, tokens = $4, stars = $5,
           finished_at = CASE WHEN $6 THEN NOW() ELSE NULL END
         WHERE id = $1`,
        [attempt.id, answered, right, attemptTokens, finished?.stars ?? null, !!finished]
      );
      if (finished) {
        const isChallenge = attempt.level_key.startsWith('desafio-');
        const label = await levelLabel(client, { subject: attempt.subject, gradeLevel: attempt.grade_level, key: attempt.level_key });
        const copihues = await levelAchievements(client, {
          studentId: req.user.id, subject: attempt.subject, gradeLevel: attempt.grade_level, levelKey: attempt.level_key,
          label, isChallenge, stars: finished.stars, previousStars: finished.previousStars,
        });
        finished.copihues = copihues.map(({ amount, reason, detail }) => ({ amount, reason, detail }));
      }
      const { rows: [{ tokens_balance: balance, copihues_balance: copihues }] } = await client.query(
        'SELECT tokens_balance, copihues_balance FROM local_students WHERE id = $1', [req.user.id]
      );

      return {
        status: 200,
        body: {
          correct,
          correctAnswer: q.correct,
          explanation: q.hint,
          note: correct ? null : q.option_notes?.[answer] ?? null,
          tokens,
          alreadyPaid: correct && before.length > 0,
          balance,
          copihues,
          finished,
        },
        level: finished && { subject: attempt.subject, key: attempt.level_key, ...finished },
      };
    });

    if (result.status === 200) {
      scheduleRating();
      if (result.level) trackEvent({ actorType: 'student', actorId: req.user.id, eventType: 'level_finished', payload: result.level });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error({ err }, 'level answer error');
    res.status(500).json({ error: 'Error al guardar tu respuesta' });
  }
});

// The companion's help: one per level. The question's clue, or, when it has none, one wrong
// option crossed out.
router.post('/attempts/:id/clue', async (req, res) => {
  const { index } = req.body || {};
  if (!Number.isInteger(index)) return res.status(400).json({ error: 'Pregunta inválida' });
  try {
    const result = await inTransaction(async client => {
      const locked = await lockAttempt(client, req.params.id, req.user.id, index);
      if (!locked.attempt) return locked;
      const { attempt } = locked;
      if (attempt.clue_used) return { status: 409, body: { error: 'Ya usaste la ayuda de este nivel', code: 'clue_used' } };

      const shown = attempt.questions[index];
      const { rows: [q] } = await client.query('SELECT clue, correct FROM questions WHERE id = $1', [shown.id]);
      await client.query('UPDATE practice_attempts SET clue_used = true WHERE id = $1', [attempt.id]);
      if (q.clue) return { status: 200, body: { clue: q.clue } };
      const wrong = shown.options.filter(o => o !== q.correct);
      return { status: 200, body: { discard: wrong[Math.floor(Math.random() * wrong.length)] } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error({ err }, 'level clue error');
    res.status(500).json({ error: 'Error al pedir la ayuda' });
  }
});

module.exports = router;
