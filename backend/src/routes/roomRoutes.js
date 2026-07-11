const logger = require('../logger');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { getSchoolCourses, getStudentsByCourse } = require('../services/anahuacService');
const anahuacTokenCache = require('../services/anahuacTokenCache');
const { trackEvent } = require('../services/eventTracker');

const router = express.Router();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Teacher creates a room, syncing students from Anahuac
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  const { course_name, subject } = req.body;
  if (!course_name || !subject) {
    return res.status(400).json({ error: 'course_name y subject son requeridos' });
  }

  const anahuac_token = anahuacTokenCache.get(req.user.id);
  if (!anahuac_token) {
    return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' });
  }

  try {
    // Sync students for this course from Anahuac
    const students = await getStudentsByCourse(anahuac_token, course_name);
    if (students.length === 0) {
      return res.status(404).json({ error: `No se encontraron alumnos activos para el curso "${course_name}"` });
    }

    // Upsert students into local DB
    for (const s of students) {
      await pool.query(`
        INSERT INTO local_students (anahuac_id, rut, first_name, last_name, course_name, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (anahuac_id) DO UPDATE
          SET first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              course_name = EXCLUDED.course_name,
              updated_at = NOW()
      `, [s.id, s.rut || null, s.nombre1, `${s.nombre2 || ''} ${s.apellido_paterno} ${s.apellido_materno}`.trim(), course_name]);
    }

    // Create room with unique code
    let code, attempts = 0;
    do {
      code = generateCode();
      attempts++;
      if (attempts > 10) throw new Error('No se pudo generar un código único');
    } while ((await pool.query('SELECT 1 FROM rooms WHERE code = $1', [code])).rows.length > 0);

    const { rows } = await pool.query(`
      INSERT INTO rooms (code, teacher_id, course_name, subject, status)
      VALUES ($1, $2, $3, $4, 'waiting')
      RETURNING *
    `, [code, req.user.id, course_name, subject]);

    const room = rows[0];

    trackEvent({
      actorType: 'teacher',
      actorId: req.user.id,
      eventType: 'room_created',
      roomId: room.id,
      payload: { course_name, subject, code: room.code },
    });

    // Return room + student list for the projector/teacher panel
    const { rows: roomStudents } = await pool.query(
      'SELECT id, first_name, last_name, tokens_balance FROM local_students WHERE course_name = $1 ORDER BY last_name, first_name',
      [course_name]
    );

    res.json({ room, students: roomStudents });
  } catch (err) {
    logger.error('Create room error:', err.message);
    res.status(500).json({ error: 'Error al crear sala', details: err.message });
  }
});

// Teacher closes a room they own — ends any active game in memory cleanly
// (same path as game:stop) and marks the room closed in the DB.
router.post('/:id/close', authenticateToken, requireTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Sala no encontrada' });

    const room = rows[0];
    if (room.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'No puedes cerrar una sala de otro docente' });
    }
    if (room.status === 'closed') {
      return res.json({ room });
    }

    const io = req.app.get('io');
    const closeRoomForTeacher = req.app.get('closeRoomForTeacher');
    const { hadActiveGame } = await closeRoomForTeacher(io, room.code);

    const { rows: updated } = await pool.query(
      "UPDATE rooms SET status = 'closed', closed_at = COALESCE(closed_at, NOW()) WHERE id = $1 RETURNING *",
      [id]
    );

    trackEvent({
      actorType: 'teacher',
      actorId: req.user.id,
      eventType: 'room_closed',
      roomId: room.id,
      payload: { code: room.code, hadActiveGame },
    });

    res.json({ room: updated[0] });
  } catch (err) {
    logger.error('Close room error:', err.message);
    res.status(500).json({ error: 'Error al cerrar la sala' });
  }
});

// Get teacher's room history with session/student counts
router.get('/history', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.code, r.course_name, r.subject, r.status, r.created_at, r.closed_at,
             COALESCE(answered.student_count, 0)::int AS student_count,
             COALESCE(sessions.sessions, '[]'::json) AS sessions
      FROM rooms r
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', g.id,
          'game_type', g.game_type,
          'subject', g.subject,
          'started_at', g.started_at,
          'ended_at', g.ended_at
        ) ORDER BY g.started_at) AS sessions
        FROM game_sessions g
        WHERE g.room_id = r.id
      ) sessions ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT sa.student_id) AS student_count
        FROM student_answers sa
        JOIN game_sessions g2 ON g2.id = sa.session_id
        WHERE g2.room_id = r.id
      ) answered ON true
      WHERE r.teacher_id = $1
      ORDER BY r.created_at DESC
      LIMIT 50
    `, [req.user.id]);

    res.json(rows);
  } catch (err) {
    logger.error('Get room history error:', err.message);
    res.status(500).json({ error: 'Error al obtener el historial de salas' });
  }
});

// Get room info + student list (public — students need this to join)
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM rooms WHERE code = $1 AND status != $2',
      [code.toUpperCase(), 'closed']
    );
    if (!rows.length) return res.status(404).json({ error: 'Sala no encontrada o cerrada' });

    const room = rows[0];
    const { rows: students } = await pool.query(
      'SELECT id, first_name, last_name FROM local_students WHERE course_name = $1 ORDER BY last_name, first_name',
      [room.course_name]
    );

    res.json({ room, students });
  } catch (err) {
    logger.error('Get room error:', err.message);
    res.status(500).json({ error: 'Error al obtener sala' });
  }
});

// Get courses from Anahuac (teacher needs this to create a room)
router.get('/meta/courses', authenticateToken, requireTeacher, async (req, res) => {
  const anahuacToken = anahuacTokenCache.get(req.user.id);
  if (!anahuacToken) return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' });
  try {
    const courses = await getSchoolCourses(anahuacToken);
    res.json(courses);
  } catch (err) {
    logger.error('Get courses error:', err.message);
    res.status(500).json({ error: 'Error al obtener cursos' });
  }
});

module.exports = router;
