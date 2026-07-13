const logger = require('../logger');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { loginToAnahuac, getAnahuacProfile } = require('../services/anahuacService');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const anahuacTokenCache = require('../services/anahuacTokenCache');
const { trackEvent } = require('../services/eventTracker');
const { normalizeRut } = require('../utils/rut');
const studentLoginRateLimiter = require('../services/studentLoginRateLimiter');

const router = express.Router();

// Federated login: validate against Anahuac, issue AcademIA JWT
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  try {
    // 1. Validate identity against Anahuac
    const anahuacData = await loginToAnahuac(email, password);
    const anahuacToken = anahuacData.token;

    // 2. Get full profile from Anahuac
    const profile = await getAnahuacProfile(anahuacToken);

    // 3. Upsert local user (Anahuac token never leaves the backend)
    const { rows } = await pool.query(`
      INSERT INTO local_users (anahuac_id, email, first_name, last_name, roles, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (anahuac_id) DO UPDATE
        SET email = EXCLUDED.email,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            roles = EXCLUDED.roles,
            updated_at = NOW()
      RETURNING *
    `, [profile.id, profile.email, profile.first_name, profile.last_name, profile.roles]);

    const localUser = rows[0];

    // 4. Cache Anahuac token server-side (never sent to frontend)
    anahuacTokenCache.set(localUser.id, anahuacToken);

    // 5. Issue AcademIA JWT
    const token = jwt.sign(
      {
        id: localUser.id,
        anahuac_id: localUser.anahuac_id,
        email: localUser.email,
        first_name: localUser.first_name,
        last_name: localUser.last_name,
        roles: localUser.roles,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    trackEvent({ actorType: 'teacher', actorId: localUser.id, eventType: 'login_success', payload: { email: localUser.email } });

    res.json({
      token,
      user: {
        id: localUser.id,
        email: localUser.email,
        first_name: localUser.first_name,
        last_name: localUser.last_name,
        roles: localUser.roles,
      },
    });
  } catch (err) {
    if (err.response?.status === 401) {
      trackEvent({ actorType: 'teacher', eventType: 'login_failed', payload: { email, reason: 'invalid_credentials' } });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    logger.error('Login error:', err.message);
    trackEvent({ actorType: 'teacher', eventType: 'login_failed', payload: { email, reason: err.message } });
    res.status(500).json({ error: 'Error al autenticar' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Local login for students: no Anahuac account, just RUT + PIN set by their teacher
router.post('/student-login', async (req, res) => {
  const { rut, pin } = req.body;
  if (!rut || !pin) return res.status(400).json({ error: 'RUT y PIN son requeridos' });

  const normalizedRut = normalizeRut(rut);
  if (!normalizedRut) return res.status(400).json({ error: 'RUT inválido' });

  if (studentLoginRateLimiter.isRateLimited(normalizedRut)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM local_students WHERE UPPER(REGEXP_REPLACE(rut, '[^0-9kK]', '', 'g')) = $1`,
      [normalizedRut]
    );
    const student = rows[0];

    if (!student) {
      studentLoginRateLimiter.registerFailure(normalizedRut);
      trackEvent({ actorType: 'student', eventType: 'student_login_failed', payload: { reason: 'not_found' } });
      return res.status(401).json({ error: 'RUT o PIN incorrecto' });
    }

    if (!student.pin_hash) {
      return res.status(403).json({ error: 'Tu profesor aún no te asigna un PIN' });
    }

    const pinMatches = await bcrypt.compare(String(pin), student.pin_hash);
    if (!pinMatches) {
      studentLoginRateLimiter.registerFailure(normalizedRut);
      trackEvent({ actorType: 'student', actorId: student.id, eventType: 'student_login_failed', payload: { reason: 'wrong_pin' } });
      return res.status(401).json({ error: 'RUT o PIN incorrecto' });
    }

    studentLoginRateLimiter.registerSuccess(normalizedRut);
    await pool.query('UPDATE local_students SET last_login_at = NOW() WHERE id = $1', [student.id]);

    const token = jwt.sign(
      { id: student.id, roles: ['student'], first_name: student.first_name, last_name: student.last_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    trackEvent({ actorType: 'student', actorId: student.id, eventType: 'student_login_success', payload: {} });

    res.json({
      token,
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        course_name: student.course_name,
        tokens_balance: student.tokens_balance,
      },
    });
  } catch (err) {
    logger.error('Student login error:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Fresh student profile (tokens_balance changes during gameplay, so the home
// page refetches instead of trusting the JWT claims from a 12h-old login)
router.get('/student-me', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, first_name, last_name, course_name, tokens_balance FROM local_students WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ student: rows[0] });
  } catch (err) {
    logger.error('Get student profile error:', err.message);
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
});

module.exports = router;
