const express = require('express');
const pool = require('../db');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const logger = require('../logger');
const { findSuspiciousQuestions } = require('../services/skillRatings');

const router = express.Router();

const VALID_SUBJECTS = ['lenguaje', 'matematica', 'ciencias', 'historia', 'ingles', 'general'];
const VALID_GRADES = ['nt1', 'nt2', '1b', '2b', '3b', '4b', '5b', '6b', '7b', '8b', 'general'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
// draft: written with AI, waiting for a teacher or UTP; approved: can be played; rejected: discarded.
const VALID_STATUSES = ['draft', 'approved', 'rejected'];

function validate(body) {
  const { subject, grade_level, difficulty, text, options, correct } = body;
  if (!subject || !VALID_SUBJECTS.includes(subject)) return 'subject inválido';
  if (!grade_level || !VALID_GRADES.includes(grade_level)) return 'grade_level inválido';
  if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) return 'difficulty inválido';
  if (!text?.trim()) return 'text requerido';
  if (!Array.isArray(options) || options.length !== 4) return 'options debe ser array de 4 elementos';
  if (options.some(o => !String(o).trim())) return 'las alternativas no pueden estar vacías';
  if (new Set(options.map(o => String(o).trim().toLowerCase())).size !== 4) return 'las alternativas deben ser distintas';
  if (!correct || !options.includes(correct)) return 'correct debe ser una de las opciones';
  return null;
}

// Notes on wrong options only make sense for options that still exist and are wrong.
function keptNotes(notes, options, correct) {
  if (!notes || typeof notes !== 'object') return null;
  const kept = Object.fromEntries(Object.entries(notes).filter(([k, v]) => options.includes(k) && k !== correct && v));
  return Object.keys(kept).length ? kept : null;
}

const WITH_REVIEWER = `
  SELECT q.*, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS reviewer_name
  FROM questions q LEFT JOIN local_users u ON u.id = q.reviewed_by`;

// GET /api/questions?subject=&grade_level=&difficulty=&active=&status=&oa_code=
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  const { subject, grade_level, difficulty, active, status, oa_code } = req.query;
  const conditions = [];
  const values = [];
  const add = (sql, value) => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };

  if (subject) add('q.subject = ?', subject);
  if (grade_level) add('q.grade_level = ?', grade_level);
  if (difficulty) add('q.difficulty = ?', difficulty);
  if (active !== undefined) add('q.active = ?', active === 'true');
  if (status && VALID_STATUSES.includes(status)) add('q.status = ?', status);
  if (oa_code) add('q.oa_code = ?', oa_code);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${WITH_REVIEWER} ${where}
     ORDER BY q.grade_level, q.subject, NULLIF(regexp_replace(q.oa_code, '\\D', '', 'g'), '')::int NULLS LAST,
              array_position(ARRAY['easy','medium','hard'], q.difficulty), q.created_at`,
    values
  );
  res.json(rows);
});

// How many questions each subject and grade has in each status (tabs and the dashboard notice).
router.get('/summary', authenticateToken, requireTeacher, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT subject, grade_level, status, COUNT(*)::int AS count FROM questions
     GROUP BY subject, grade_level, status ORDER BY grade_level, subject`
  );
  res.json(rows);
});

// Questions answered worse than chance with one dominant wrong answer: wrong key or shared misconception.
router.get('/review', authenticateToken, requireTeacher, async (req, res) => {
  try {
    res.json({ questions: await findSuspiciousQuestions() });
  } catch (err) {
    logger.error({ err }, 'question review fetch error');
    res.status(500).json({ error: 'Error al obtener preguntas para revisar' });
  }
});

router.get('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const { rows } = await pool.query(`${WITH_REVIEWER} WHERE q.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  res.json(rows[0]);
});

// POST /api/questions — written by staff, so it is approved from the start.
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const { subject, grade_level, difficulty = 'medium', text, options, correct, hint, clue, oa_code } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO questions (subject, grade_level, difficulty, text, options, correct, hint, clue, oa_code, created_by,
                            status, source, reviewed_by, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved', 'manual', $10, NOW()) RETURNING *`,
    [subject, grade_level, difficulty, text.trim(), JSON.stringify(options), correct, hint || null, clue || null,
      oa_code || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/questions/:id — with { approve: true } an edited draft is approved in the same step.
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const { subject, grade_level, difficulty = 'medium', text, options, correct, hint, clue, oa_code, approve } = req.body;
  const { rows: current } = await pool.query('SELECT option_notes FROM questions WHERE id = $1', [req.params.id]);
  if (!current.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  const notes = keptNotes(current[0].option_notes, options, correct);

  const { rows } = await pool.query(
    `UPDATE questions SET subject=$1, grade_level=$2, difficulty=$3, text=$4, options=$5, correct=$6, hint=$7,
       clue=$8, oa_code=$9, option_notes=$10, updated_at=NOW()
       ${approve ? ", status='approved', active=true, reviewed_by=$12, reviewed_at=NOW(), review_note=NULL" : ''}
     WHERE id=$11 RETURNING *`,
    [subject, grade_level, difficulty, text.trim(), JSON.stringify(options), correct, hint || null, clue || null,
      oa_code || null, notes ? JSON.stringify(notes) : null, req.params.id, ...(approve ? [req.user.id] : [])]
  );
  res.json(rows[0]);
});

// PATCH /api/questions/:id/review { decision: 'approve' | 'reject' | 'draft', note }
router.patch('/:id/review', authenticateToken, requireTeacher, async (req, res) => {
  const STATUS_BY_DECISION = { approve: 'approved', reject: 'rejected', draft: 'draft' };
  const status = STATUS_BY_DECISION[req.body?.decision];
  if (!status) return res.status(400).json({ error: 'decision inválida' });
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 300) : null;
  if (status === 'rejected' && !note) return res.status(400).json({ error: 'Indica por qué se descarta' });

  const { rows } = await pool.query(
    `UPDATE questions SET status = $1, active = ($1 = 'approved'), review_note = $2,
       reviewed_by = CASE WHEN $1 = 'draft' THEN NULL ELSE $3::uuid END,
       reviewed_at = CASE WHEN $1 = 'draft' THEN NULL ELSE NOW() END,
       updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [status, status === 'rejected' ? note : null, req.user.id, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  res.json(rows[0]);
});

// PATCH /api/questions/:id/toggle — activar/desactivar (solo preguntas aprobadas)
router.patch('/:id/toggle', authenticateToken, requireTeacher, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE questions SET active = NOT active, updated_at = NOW() WHERE id = $1 AND status = 'approved' RETURNING *`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada o sin aprobar' });
  res.json(rows[0]);
});

// DELETE /api/questions/:id — a question students already answered is discarded, never deleted:
// its answers feed the ratings.
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const { rows: used } = await pool.query('SELECT 1 FROM student_answers WHERE question_id = $1 LIMIT 1', [req.params.id]);
  if (used.length) return res.status(409).json({ error: 'Ya tiene respuestas de alumnos: descártala en vez de eliminarla' });
  const { rows } = await pool.query('DELETE FROM questions WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  res.json({ deleted: rows[0].id });
});

module.exports = router;
module.exports.VALID_SUBJECTS = VALID_SUBJECTS;
module.exports.VALID_GRADES = VALID_GRADES;
