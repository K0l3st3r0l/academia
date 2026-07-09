const express = require('express');
const pool = require('../db');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

const VALID_SUBJECTS = ['lenguaje', 'matematica', 'ciencias', 'historia', 'ingles', 'general'];
const VALID_GRADES = ['nt1', 'nt2', '1b', '2b', '3b', '4b', '5b', '6b', '7b', '8b', 'general'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

function validate(body) {
  const { subject, grade_level, difficulty, text, options, correct, hint, oa_code } = body;
  if (!subject || !VALID_SUBJECTS.includes(subject)) return 'subject inválido';
  if (!grade_level || !VALID_GRADES.includes(grade_level)) return 'grade_level inválido';
  if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) return 'difficulty inválido';
  if (!text?.trim()) return 'text requerido';
  if (!Array.isArray(options) || options.length !== 4) return 'options debe ser array de 4 elementos';
  if (!correct || !options.includes(correct)) return 'correct debe ser una de las opciones';
  return null;
}

// GET /api/questions?subject=&grade_level=&difficulty=&active=
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  const { subject, grade_level, difficulty, active } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;

  if (subject) { conditions.push(`subject = $${i++}`); values.push(subject); }
  if (grade_level) { conditions.push(`grade_level = $${i++}`); values.push(grade_level); }
  if (difficulty) { conditions.push(`difficulty = $${i++}`); values.push(difficulty); }
  if (active !== undefined) { conditions.push(`active = $${i++}`); values.push(active === 'true'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM questions ${where} ORDER BY grade_level, subject, created_at DESC`,
    values
  );
  res.json(rows);
});

// GET /api/questions/:id
router.get('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  res.json(rows[0]);
});

// POST /api/questions
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const { subject, grade_level, difficulty = 'medium', text, options, correct, hint, oa_code } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO questions (subject, grade_level, difficulty, text, options, correct, hint, oa_code, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [subject, grade_level, difficulty, text.trim(), JSON.stringify(options), correct, hint || null, oa_code || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/questions/:id
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const { subject, grade_level, difficulty = 'medium', text, options, correct, hint, oa_code } = req.body;
  const { rows } = await pool.query(
    `UPDATE questions SET subject=$1, grade_level=$2, difficulty=$3, text=$4, options=$5,
     correct=$6, hint=$7, oa_code=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [subject, grade_level, difficulty, text.trim(), JSON.stringify(options), correct, hint || null, oa_code || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  res.json(rows[0]);
});

// PATCH /api/questions/:id/toggle — activar/desactivar
router.patch('/:id/toggle', authenticateToken, requireTeacher, async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE questions SET active = NOT active, updated_at = NOW() WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  res.json(rows[0]);
});

// DELETE /api/questions/:id
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const { rows } = await pool.query('DELETE FROM questions WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
  res.json({ deleted: rows[0].id });
});

module.exports = router;
module.exports.VALID_SUBJECTS = VALID_SUBJECTS;
module.exports.VALID_GRADES = VALID_GRADES;
