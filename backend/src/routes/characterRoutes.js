const logger = require('../logger');
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const { trackEvent } = require('../services/eventTracker');
const { getCatalog, validateLayers } = require('../services/characterCatalog');

const router = express.Router();

router.get('/catalog', (req, res) => {
  res.json(getCatalog());
});

router.get('/me', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT layers, created_at, updated_at FROM characters WHERE student_id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Aún no tienes un personaje' });
    res.json({ character: rows[0] });
  } catch (err) {
    logger.error('Get character error:', err.message);
    res.status(500).json({ error: 'Error al obtener el personaje' });
  }
});

router.put('/me', authenticateToken, requireStudent, async (req, res) => {
  const { layers } = req.body;
  if (!layers || typeof layers !== 'object') return res.status(400).json({ error: 'layers es requerido' });

  const details = validateLayers(layers);
  if (details.length) return res.status(400).json({ error: 'Personaje inválido', details });

  try {
    const { rows: existing } = await pool.query('SELECT id FROM characters WHERE student_id = $1', [req.user.id]);
    const isNew = existing.length === 0;

    const { rows } = await pool.query(`
      INSERT INTO characters (student_id, layers, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (student_id) DO UPDATE
        SET layers = EXCLUDED.layers, updated_at = NOW()
      RETURNING layers, created_at, updated_at
    `, [req.user.id, JSON.stringify(layers)]);

    trackEvent({
      actorType: 'student',
      actorId: req.user.id,
      eventType: isNew ? 'character_created' : 'character_updated',
      payload: { layers },
    });

    res.json({ character: rows[0] });
  } catch (err) {
    logger.error('Save character error:', err.message);
    res.status(500).json({ error: 'Error al guardar el personaje' });
  }
});

module.exports = router;
