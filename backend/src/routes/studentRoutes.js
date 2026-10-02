const logger = require('../logger');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { trackEvent } = require('../services/eventTracker');
const { syncStudents } = require('../services/studentSync');
const anahuacTokenCache = require('../services/anahuacTokenCache');

const router = express.Router();

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Students synced for a course, with PIN status (never the PIN itself)
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  const { course_name } = req.query;
  if (!course_name) return res.status(400).json({ error: 'course_name es requerido' });

  // Refresh from Anahuac first so new students can get a PIN without creating a room.
  // If Anahuac is unreachable (or the token cache was lost in a restart), the last
  // known list is still useful: return it and say it may be stale.
  let sync = { ok: true };
  const anahuacToken = anahuacTokenCache.get(req.user.id);
  if (!anahuacToken) {
    sync = { ok: false, reason: 'no_session' };
  } else {
    try {
      sync = { ok: true, ...(await syncStudents(anahuacToken, course_name)) };
    } catch (err) {
      logger.error('Student sync error:', err.message);
      sync = { ok: false, reason: 'anahuac_error' };
    }
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, institutional_email, (pin_hash IS NOT NULL) AS has_pin,
              (password_hash IS NOT NULL) AS has_password, last_login_at
       FROM local_students WHERE course_name = $1 AND active AND NOT is_test ORDER BY last_name, first_name`,
      [course_name]
    );
    res.json({ students: rows, sync });
  } catch (err) {
    logger.error('List students error:', err.message);
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
});

// Reset one student's PIN — the plaintext PIN is only ever returned here, once
router.post('/:id/reset-pin', authenticateToken, requireTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT id FROM local_students WHERE id = $1 AND active', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Alumno no encontrado' });

    const pin = generatePin();
    const pinHash = await bcrypt.hash(pin, 10);
    await pool.query(
      'UPDATE local_students SET pin_hash = $1, pin_updated_at = NOW() WHERE id = $2',
      [pinHash, id]
    );

    trackEvent({ actorType: 'teacher', actorId: req.user.id, eventType: 'pin_reset', payload: { student_id: id } });

    res.json({ id, pin });
  } catch (err) {
    logger.error('Reset pin error:', err.message);
    res.status(500).json({ error: 'Error al generar el PIN' });
  }
});

// Reset every student's PIN for a course — for printing/dictating to the class
router.post('/reset-pins-bulk', authenticateToken, requireTeacher, async (req, res) => {
  const { course_name } = req.body;
  if (!course_name) return res.status(400).json({ error: 'course_name es requerido' });

  try {
    const { rows: students } = await pool.query(
      'SELECT id, first_name, last_name FROM local_students WHERE course_name = $1 AND active AND NOT is_test ORDER BY last_name, first_name',
      [course_name]
    );
    if (!students.length) return res.status(404).json({ error: `No hay alumnos sincronizados para el curso "${course_name}"` });

    const result = [];
    for (const s of students) {
      const pin = generatePin();
      const pinHash = await bcrypt.hash(pin, 10);
      await pool.query(
        'UPDATE local_students SET pin_hash = $1, pin_updated_at = NOW() WHERE id = $2',
        [pinHash, s.id]
      );
      result.push({ id: s.id, nombre: `${s.first_name} ${s.last_name}`.trim(), pin });
    }

    trackEvent({
      actorType: 'teacher',
      actorId: req.user.id,
      eventType: 'pin_reset',
      payload: { course_name, count: result.length, bulk: true },
    });

    res.json(result);
  } catch (err) {
    logger.error('Bulk reset pin error:', err.message);
    res.status(500).json({ error: 'Error al generar los PINs' });
  }
});

module.exports = router;
