const logger = require('../logger');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { loginToAnahuac, getAnahuacProfile } = require('../services/anahuacService');
const { authenticateToken } = require('../middleware/auth');
const anahuacTokenCache = require('../services/anahuacTokenCache');

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
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    logger.error('Login error:', err.message);
    res.status(500).json({ error: 'Error al autenticar' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
