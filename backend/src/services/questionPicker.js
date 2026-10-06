const pool = require('../db');
const { expectedCorrect, SEED_BY_LABEL } = require('./skillRatings');

// Share of the class expected to answer right, per demand level.
const LEVEL_TARGETS = { repaso: 0.85, ajustado: 0.65, desafio: 0.45 };
const DEFAULT_LEVEL = 'ajustado';
const SUBJECT_KEY = '*';

function questionDifficulty(q) {
  return q.rating ?? SEED_BY_LABEL[q.difficulty] ?? 0;
}

// Expected share of the class that answers q right. A student with no history
// counts as average (skill 0), so a new course falls back to the question rating.
function classSuccess(q, students) {
  if (!students.length) return expectedCorrect(0, questionDifficulty(q));
  const total = students.reduce((sum, s) => {
    const skill = (s.subject ?? 0) + (s.oas.get(`${q.grade_level}|${q.oa_code}`) ?? 0);
    return sum + expectedCorrect(skill, questionDifficulty(q));
  }, 0);
  return total / students.length;
}

// Pure ranking so it can be tested without randomness: questions not yet shown in
// the room first, curricular ones before 'general' filler, then closest to the
// target. The jitter only reorders questions that are about equally suitable.
function rankCandidates(candidates, students, { target, count, usedIds, random = Math.random }) {
  const scored = candidates.map(q => {
    const success = classSuccess(q, students);
    return {
      q,
      success,
      key: [usedIds.has(q.id) ? 1 : 0, q.grade_level === 'general' ? 1 : 0, Math.abs(success - target) + random() * 0.05],
    };
  });
  scored.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  // Easiest first, so the round warms up before the harder questions.
  return scored.slice(0, count).sort((a, b) => b.success - a.success);
}

async function loadStudentSkills(studentIds, subject) {
  if (!studentIds.length) return [];
  const { rows } = await pool.query(
    `SELECT student_id, grade_level, oa_code, rating FROM student_skill_ratings
     WHERE student_id = ANY($1::uuid[]) AND subject = $2`,
    [studentIds, subject]
  );
  const byStudent = new Map(studentIds.map(id => [id, { subject: 0, oas: new Map() }]));
  for (const r of rows) {
    const s = byStudent.get(r.student_id);
    if (r.oa_code === SUBJECT_KEY) s.subject = r.rating;
    else s.oas.set(`${r.grade_level}|${r.oa_code}`, r.rating);
  }
  return [...byStudent.values()];
}

// With OA chosen, only curricular questions of those OA; otherwise the whole
// subject for the course's grade plus 'general' filler.
async function pickQuestions({ subject, gradeLevel, oaCodes = [], level = DEFAULT_LEVEL, count, usedIds, studentIds = [] }) {
  const byOa = oaCodes.length > 0;
  const levels = gradeLevel ? [gradeLevel, 'general'] : ['general'];
  const { rows: candidates } = await pool.query(
    `SELECT q.*, c.label AS oa_label
     FROM questions q
     LEFT JOIN curriculum_oas c ON c.subject = q.subject AND c.grade_level = q.grade_level AND c.code = q.oa_code
     WHERE q.subject = $1 AND q.active = true AND q.status = 'approved'
       AND ${byOa ? 'q.grade_level = $2 AND q.oa_code = ANY($3::text[])' : 'q.grade_level = ANY($2::text[])'}`,
    byOa ? [subject, gradeLevel, oaCodes] : [subject, levels]
  );
  const students = await loadStudentSkills(studentIds, subject);
  return rankCandidates(candidates, students, { target: LEVEL_TARGETS[level], count, usedIds })
    .map(({ q }) => q);
}

// Home practice (plan-modo-libre §3.3): most questions at ~78% expected success for this student
// and the last ones a bit harder (~60%) so the rating can climb. A challenge takes one
// question per OA. Questions the student already got right go last: they no longer pay.
const PRACTICE_TARGETS = { easy: 0.78, stretch: 0.6 };
const STRETCH_SHARE = 1 / 3;

async function pickForStudent({ studentId, subject, gradeLevel, oaCodes, count, onePerOa = false, random = Math.random }) {
  const { rows: candidates } = await pool.query(
    `SELECT q.* FROM questions q
     WHERE q.subject = $1 AND q.grade_level = $2 AND q.oa_code = ANY($3::text[])
       AND q.active = true AND q.status = 'approved'`,
    [subject, gradeLevel, oaCodes]
  );
  const { rows: right } = await pool.query(
    'SELECT DISTINCT question_id FROM student_answers WHERE student_id = $1 AND is_correct AND question_id IS NOT NULL',
    [studentId]
  );
  const usedIds = new Set(right.map(r => r.question_id));
  const students = await loadStudentSkills([studentId], subject);
  const rank = (from, target, n) => rankCandidates(from, students, { target, count: n, usedIds, random });

  let picked;
  if (onePerOa) {
    picked = oaCodes
      .map(code => rank(candidates.filter(q => q.oa_code === code), (PRACTICE_TARGETS.easy + PRACTICE_TARGETS.stretch) / 2, 1)[0])
      .filter(Boolean)
      .slice(0, count);
  } else {
    const stretch = Math.round(count * STRETCH_SHARE);
    const easy = rank(candidates, PRACTICE_TARGETS.easy, count - stretch);
    const taken = new Set(easy.map(({ q }) => q.id));
    picked = [...easy, ...rank(candidates.filter(q => !taken.has(q.id)), PRACTICE_TARGETS.stretch, stretch)];
  }
  return picked.sort((a, b) => b.success - a.success).map(({ q }) => q);
}

module.exports = { pickQuestions, pickForStudent, rankCandidates, classSuccess, LEVEL_TARGETS, DEFAULT_LEVEL, PRACTICE_TARGETS };
