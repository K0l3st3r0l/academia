const logger = require('../logger');
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

// GET /api/sessions/:id — detail of a game session (teacher must own the room)
router.get('/:id', authenticateToken, requireTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: sessionRows } = await pool.query(`
      SELECT gs.id, gs.room_id, gs.game_type, gs.subject, gs.started_at, gs.ended_at, gs.summary,
             r.code, r.course_name, r.subject AS room_subject, r.teacher_id
      FROM game_sessions gs
      JOIN rooms r ON r.id = gs.room_id
      WHERE gs.id = $1
    `, [id]);

    if (!sessionRows.length) return res.status(404).json({ error: 'Sesión no encontrada' });

    const session = sessionRows[0];
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta sesión' });
    }

    const { rows: perStudent } = await pool.query(`
      SELECT ls.id AS student_id, ls.first_name, ls.last_name,
             COUNT(sa.id)::int AS total_answers,
             COUNT(sa.id) FILTER (WHERE sa.is_correct)::int AS correct_answers,
             ROUND(AVG(sa.time_taken_ms))::int AS avg_time_ms
      FROM student_answers sa
      JOIN local_students ls ON ls.id = sa.student_id
      WHERE sa.session_id = $1
      GROUP BY ls.id, ls.first_name, ls.last_name
      ORDER BY correct_answers DESC, ls.last_name, ls.first_name
    `, [id]);

    const { rows: tokenRows } = await pool.query(`
      SELECT student_id, SUM(amount)::int AS tokens_earned
      FROM token_ledger
      WHERE room_id = $1
      GROUP BY student_id
    `, [session.room_id]);
    const tokensByStudent = Object.fromEntries(tokenRows.map(t => [t.student_id, t.tokens_earned]));

    const students = perStudent.map(s => ({
      student_id: s.student_id,
      name: `${s.first_name} ${s.last_name}`,
      correct_answers: s.correct_answers,
      total_answers: s.total_answers,
      avg_time_ms: s.avg_time_ms,
      tokens_earned: tokensByStudent[s.student_id] || 0,
    }));

    delete session.teacher_id;
    res.json({ session, students });
  } catch (err) {
    logger.error('Get session detail error:', err.message);
    res.status(500).json({ error: 'Error al obtener la sesión' });
  }
});

module.exports = router;
