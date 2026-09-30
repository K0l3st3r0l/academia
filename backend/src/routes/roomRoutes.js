const logger = require('../logger');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { getSchoolCourses } = require('../services/anahuacService');
const { syncStudents } = require('../services/studentSync');
const anahuacTokenCache = require('../services/anahuacTokenCache');
const { trackEvent } = require('../services/eventTracker');
const { issueRoomTicket } = require('../services/roomTicket');
const roomJoinRateLimiter = require('../services/roomJoinRateLimiter');
const { normalizeRut, isValidRut } = require('../utils/rut');

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
    await syncStudents(anahuac_token, course_name);

    // Student list for the projector/teacher panel
    const { rows: roomStudents } = await pool.query(
      'SELECT id, first_name, last_name, tokens_balance FROM local_students WHERE course_name = $1 AND active ORDER BY last_name, first_name',
      [course_name]
    );
    if (roomStudents.length === 0) {
      return res.status(404).json({ error: `No se encontraron alumnos activos para el curso "${course_name}"` });
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

// Rooms a student can walk into right now, so the "Clase" tab can offer them
// without typing a code. Codes are no secret since joining needs the student's
// RUT. The age cap hides rooms a teacher left open and never closed.
const OPEN_ROOM_MAX_AGE_HOURS = 3;

router.get('/open', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT code, course_name, subject, status, created_at FROM rooms
       WHERE status IN ('waiting', 'active') AND created_at > NOW() - make_interval(hours => $1)
       ORDER BY created_at DESC
       LIMIT 20`,
      [OPEN_ROOM_MAX_AGE_HOURS]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ rooms: rows });
  } catch (err) {
    logger.error('Open rooms error:', err.message);
    res.status(500).json({ error: 'Error al buscar salas abiertas' });
  }
});

// Public room info. No roster: anyone with the code could read the names of the
// whole class, and picking a name from a list let a student play as a classmate.
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM rooms WHERE code = $1 AND status != $2',
      [code.toUpperCase(), 'closed']
    );
    if (!rows.length) return res.status(404).json({ error: 'Sala no encontrada o cerrada' });

    res.json({ room: rows[0] });
  } catch (err) {
    logger.error('Get room error:', err.message);
    res.status(500).json({ error: 'Error al obtener sala' });
  }
});

// A student identifies with their RUT and gets a ticket for this room only;
// student:join trusts the ticket, never a student id sent by the client.
router.post('/:code/join', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { rut } = req.body || {};

  if (!isValidRut(rut)) {
    return res.status(400).json({ error: 'Ese RUT no es válido. Revisa los números y el dígito verificador.' });
  }
  if (roomJoinRateLimiter.isRateLimited(code)) {
    return res.status(429).json({ error: 'Hubo demasiados intentos en esta sala. Pídele ayuda a tu profesor.' });
  }

  try {
    const { rows: roomRows } = await pool.query(
      'SELECT id, code, course_name FROM rooms WHERE code = $1 AND status != $2',
      [code, 'closed']
    );
    if (!roomRows.length) return res.status(404).json({ error: 'Sala no encontrada o cerrada' });
    const room = roomRows[0];

    const { rows } = await pool.query(
      `SELECT id, first_name, last_name FROM local_students
       WHERE UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g')) = $1 AND course_name = $2 AND active
       LIMIT 1`,
      [normalizeRut(rut), room.course_name]
    );
    const student = rows[0];

    if (!student) {
      roomJoinRateLimiter.registerFailure(code);
      trackEvent({ actorType: 'student', eventType: 'room_join_failed', roomId: room.id, payload: { reason: 'not_in_course' } });
      return res.status(404).json({ error: `Ese RUT no aparece en ${room.course_name}. Revísalo o avísale a tu profesor.` });
    }

    const displayName = `${student.first_name} ${student.last_name}`.trim();
    const { ticket } = issueRoomTicket({ studentId: student.id, roomCode: room.code, displayName });
    res.json({ ticket, student: { firstName: student.first_name, displayName } });
  } catch (err) {
    logger.error('Room join error:', err.message);
    res.status(500).json({ error: 'Error al entrar a la sala' });
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
