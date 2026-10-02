const logger = require('../logger');
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireStudent, requireAdmin } = require('../middleware/auth');
const { trackEvent } = require('../services/eventTracker');
const { getCatalog, validateLayers, itemPrice, pricedItemsIn, renameCost } = require('../services/characterCatalog');
const { cleanName, nameProblem } = require('../services/characterName');
const { spendTokens, InsufficientTokensError } = require('../services/tokenWallet');
const { getAttributes } = require('../services/characterStats');

const router = express.Router();

const CHARACTER_FIELDS = 'layers, name, name_status, name_set_at, created_at, updated_at';

async function ownedItems(studentId) {
  const { rows } = await pool.query('SELECT item_id FROM student_items WHERE student_id = $1', [studentId]);
  return rows.map(r => r.item_id);
}

async function balanceOf(studentId) {
  const { rows } = await pool.query('SELECT tokens_balance FROM local_students WHERE id = $1', [studentId]);
  return rows[0]?.tokens_balance ?? 0;
}

function insufficientTokens(res, err) {
  return res.status(400).json({
    error: `Te faltan tokens: cuesta ${err.price} y tienes ${err.balance}.`,
    code: 'insufficient_tokens',
  });
}

async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

router.get('/catalog', (req, res) => {
  res.json(getCatalog());
});

router.get('/me', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${CHARACTER_FIELDS} FROM characters WHERE student_id = $1`, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Aún no tienes un personaje' });
    res.json({ character: rows[0], ownedItems: await ownedItems(req.user.id), tokens: await balanceOf(req.user.id) });
  } catch (err) {
    logger.error('Get character error:', err.message);
    res.status(500).json({ error: 'Error al obtener el personaje' });
  }
});

router.get('/me/stats', authenticateToken, requireStudent, async (req, res) => {
  try {
    res.json({ attributes: await getAttributes(req.user.id) });
  } catch (err) {
    logger.error({ err }, 'character stats error');
    res.status(500).json({ error: 'Error al calcular tus atributos' });
  }
});

// The name only goes in on creation; afterwards it changes through PUT /me/name, which costs tokens.
router.put('/me', authenticateToken, requireStudent, async (req, res) => {
  const { layers, name } = req.body;
  if (!layers || typeof layers !== 'object') return res.status(400).json({ error: 'layers es requerido' });

  const details = validateLayers(layers);
  if (details.length) return res.status(400).json({ error: 'Personaje inválido', details });

  try {
    const priced = pricedItemsIn(layers);
    if (priced.length) {
      const owned = new Set(await ownedItems(req.user.id));
      const missing = priced.filter(id => !owned.has(id));
      if (missing.length) {
        return res.status(400).json({ error: 'Todavía no tienes todo lo que elegiste. Cómpralo primero.', code: 'not_owned', details: missing });
      }
    }

    const { rows: existing } = await pool.query('SELECT student_id FROM characters WHERE student_id = $1', [req.user.id]);
    const isNew = existing.length === 0;

    let rows;
    if (isNew) {
      const problem = nameProblem(name);
      if (problem) return res.status(400).json({ error: problem, code: 'invalid_name' });
      ({ rows } = await pool.query(`
        INSERT INTO characters (student_id, layers, name, name_status, name_set_at, updated_at)
        VALUES ($1, $2, $3, 'pending', NOW(), NOW())
        RETURNING ${CHARACTER_FIELDS}
      `, [req.user.id, JSON.stringify(layers), cleanName(name)]));
    } else {
      ({ rows } = await pool.query(`
        UPDATE characters SET layers = $2, updated_at = NOW() WHERE student_id = $1
        RETURNING ${CHARACTER_FIELDS}
      `, [req.user.id, JSON.stringify(layers)]));
    }

    trackEvent({
      actorType: 'student',
      actorId: req.user.id,
      eventType: isNew ? 'character_created' : 'character_updated',
      payload: isNew ? { layers, name: rows[0].name } : { layers },
    });

    res.json({ character: rows[0] });
  } catch (err) {
    logger.error('Save character error:', err.message);
    res.status(500).json({ error: 'Error al guardar el personaje' });
  }
});

// Free when an admin rejected the current name; otherwise it costs renameCost tokens.
router.put('/me/name', authenticateToken, requireStudent, async (req, res) => {
  const problem = nameProblem(req.body?.name);
  if (problem) return res.status(400).json({ error: problem, code: 'invalid_name' });
  const name = cleanName(req.body.name);

  try {
    const result = await inTransaction(async client => {
      const { rows } = await client.query(
        'SELECT name, name_status FROM characters WHERE student_id = $1 FOR UPDATE',
        [req.user.id]
      );
      if (!rows.length) return { status: 404, body: { error: 'Primero crea tu personaje' } };
      if (rows[0].name === name) return { status: 400, body: { error: 'Ese ya es el nombre de tu personaje.' } };

      const free = rows[0].name_status === 'rejected' || !rows[0].name;
      const cost = free ? 0 : renameCost();
      const tokens = free ? null : await spendTokens(client, { studentId: req.user.id, amount: cost, reason: 'character_rename' });
      const { rows: updated } = await client.query(`
        UPDATE characters
        SET name = $2, name_status = 'pending', name_set_at = NOW(),
            name_reviewed_by = NULL, name_reviewed_at = NULL, updated_at = NOW()
        WHERE student_id = $1
        RETURNING ${CHARACTER_FIELDS}
      `, [req.user.id, name]);
      return { status: 200, body: { character: updated[0], cost, tokens }, previous: rows[0].name, cost };
    });

    if (result.status === 200) {
      trackEvent({
        actorType: 'student', actorId: req.user.id, eventType: 'character_renamed',
        payload: { from: result.previous, to: name, cost: result.cost },
      });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof InsufficientTokensError) return insufficientTokens(res, err);
    logger.error({ err }, 'rename character error');
    res.status(500).json({ error: 'Error al cambiar el nombre' });
  }
});

router.post('/me/items/:itemId', authenticateToken, requireStudent, async (req, res) => {
  const { itemId } = req.params;
  const price = itemPrice(itemId);
  if (price === null) return res.status(404).json({ error: 'Ese artículo no existe' });
  if (price === 0) return res.status(400).json({ error: 'Ese artículo es gratis: no hace falta comprarlo.' });

  try {
    const result = await inTransaction(async client => {
      const { rowCount } = await client.query(
        'INSERT INTO student_items (student_id, item_id, price) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [req.user.id, itemId, price]
      );
      if (!rowCount) return { status: 400, body: { error: 'Ya tienes ese artículo.' } };
      const tokens = await spendTokens(client, { studentId: req.user.id, amount: price, reason: 'shop_item' });
      return { status: 200, body: { itemId, price, tokens } };
    });

    if (result.status === 200) {
      trackEvent({ actorType: 'student', actorId: req.user.id, eventType: 'item_bought', payload: { itemId, price } });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof InsufficientTokensError) return insufficientTokens(res, err);
    logger.error({ err }, 'buy item error');
    res.status(500).json({ error: 'Error al comprar el artículo' });
  }
});

// ── Admin: review of character names ────────────────────────────────────
router.get('/names', authenticateToken, requireAdmin, async (req, res) => {
  const status = req.query.status || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT c.student_id, c.name, c.name_status, c.name_set_at, c.name_reviewed_at,
             s.first_name, s.last_name, s.course_name
      FROM characters c JOIN local_students s ON s.id = c.student_id
      WHERE c.name IS NOT NULL AND ($1 = 'all' OR c.name_status = $1)
      ORDER BY c.name_set_at DESC
      LIMIT 500
    `, [status]);
    res.json({ names: rows });
  } catch (err) {
    logger.error({ err }, 'list character names error');
    res.status(500).json({ error: 'Error al obtener los nombres' });
  }
});

router.patch('/names/:studentId', authenticateToken, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  if (!/^[0-9a-f-]{36}$/i.test(req.params.studentId)) return res.status(404).json({ error: 'Personaje no encontrado' });
  try {
    const { rows } = await pool.query(`
      UPDATE characters SET name_status = $2, name_reviewed_by = $3, name_reviewed_at = NOW()
      WHERE student_id = $1 AND name IS NOT NULL
      RETURNING student_id, name, name_status
    `, [req.params.studentId, status, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Personaje no encontrado' });
    trackEvent({
      actorType: 'teacher', actorId: req.user.id, eventType: 'character_name_reviewed',
      payload: { studentId: req.params.studentId, name: rows[0].name, status },
    });
    res.json({ character: rows[0] });
  } catch (err) {
    logger.error({ err }, 'review character name error');
    res.status(500).json({ error: 'Error al revisar el nombre' });
  }
});

module.exports = router;
