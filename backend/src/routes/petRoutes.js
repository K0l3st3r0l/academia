const logger = require('../logger');
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireStudent, requireAdmin } = require('../middleware/auth');
const { trackEvent } = require('../services/eventTracker');
const { getPetCatalog, isSpecies, growthFor, petRenameCost, changeSpeciesCost } = require('../services/petCatalog');
const { cleanName, nameProblem } = require('../services/characterName');
const { spendTokens, InsufficientTokensError, insufficientTokens } = require('../services/tokenWallet');
const { inTransaction } = require('../db/transaction');

const router = express.Router();

const PET_FIELDS = 'species, name, name_status, name_set_at, stage_seen, created_at';

// Days with at least one answer, in Chile's calendar: playing is what makes the pet grow.
async function daysPlayed(studentId) {
  const { rows } = await pool.query(`
    SELECT COUNT(DISTINCT (answered_at AT TIME ZONE 'America/Santiago')::date)::int AS days
    FROM student_answers WHERE student_id = $1
  `, [studentId]);
  return rows[0].days;
}

async function balanceOf(client, studentId) {
  const { rows } = await client.query('SELECT tokens_balance FROM local_students WHERE id = $1', [studentId]);
  return rows[0]?.tokens_balance ?? 0;
}

router.get('/catalog', (req, res) => {
  res.json(getPetCatalog());
});

router.get('/me', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${PET_FIELDS} FROM student_pets WHERE student_id = $1`, [req.user.id]);
    res.json({
      pet: rows[0] || null,
      growth: growthFor(await daysPlayed(req.user.id)),
      tokens: await balanceOf(pool, req.user.id),
    });
  } catch (err) {
    logger.error({ err }, 'get pet error');
    res.status(500).json({ error: 'Error al obtener tu compañero' });
  }
});

// Adopting is free and happens once; afterwards species and name change through their own routes.
router.post('/me', authenticateToken, requireStudent, async (req, res) => {
  const { species, name } = req.body || {};
  if (!isSpecies(species)) return res.status(400).json({ error: 'Elige uno de los compañeros.', code: 'invalid_species' });
  const problem = nameProblem(name);
  if (problem) return res.status(400).json({ error: problem, code: 'invalid_name' });

  try {
    const growth = growthFor(await daysPlayed(req.user.id));
    const { rows } = await pool.query(`
      INSERT INTO student_pets (student_id, species, name, stage_seen)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (student_id) DO NOTHING
      RETURNING ${PET_FIELDS}
    `, [req.user.id, species, cleanName(name), growth.stage]);
    if (!rows.length) return res.status(409).json({ error: 'Ya tienes un compañero.' });

    trackEvent({ actorType: 'student', actorId: req.user.id, eventType: 'pet_adopted', payload: { species, name: rows[0].name } });
    res.status(201).json({ pet: rows[0], growth });
  } catch (err) {
    logger.error({ err }, 'adopt pet error');
    res.status(500).json({ error: 'Error al adoptar a tu compañero' });
  }
});

// Changing species keeps the growth: it belongs to the student's days of play, not to the animal.
router.put('/me/species', authenticateToken, requireStudent, async (req, res) => {
  const { species } = req.body || {};
  if (!isSpecies(species)) return res.status(400).json({ error: 'Elige uno de los compañeros.', code: 'invalid_species' });

  try {
    const result = await inTransaction(async client => {
      const { rows } = await client.query('SELECT species FROM student_pets WHERE student_id = $1 FOR UPDATE', [req.user.id]);
      if (!rows.length) return { status: 404, body: { error: 'Primero elige tu compañero' } };
      if (rows[0].species === species) return { status: 400, body: { error: 'Ese ya es tu compañero.' } };

      const cost = changeSpeciesCost();
      const tokens = await spendTokens(client, { studentId: req.user.id, amount: cost, reason: 'pet_species_change' });
      const { rows: updated } = await client.query(`
        UPDATE student_pets SET species = $2, updated_at = NOW() WHERE student_id = $1
        RETURNING ${PET_FIELDS}
      `, [req.user.id, species]);
      return { status: 200, body: { pet: updated[0], cost, tokens }, previous: rows[0].species, cost };
    });

    if (result.status === 200) {
      trackEvent({
        actorType: 'student', actorId: req.user.id, eventType: 'pet_species_changed',
        payload: { from: result.previous, to: species, cost: result.cost },
      });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof InsufficientTokensError) return insufficientTokens(res, err);
    logger.error({ err }, 'change pet species error');
    res.status(500).json({ error: 'Error al cambiar de compañero' });
  }
});

// Same rule as the character: free when an admin rejected the current name, otherwise it costs tokens.
router.put('/me/name', authenticateToken, requireStudent, async (req, res) => {
  const problem = nameProblem(req.body?.name);
  if (problem) return res.status(400).json({ error: problem, code: 'invalid_name' });
  const name = cleanName(req.body.name);

  try {
    const result = await inTransaction(async client => {
      const { rows } = await client.query('SELECT name, name_status FROM student_pets WHERE student_id = $1 FOR UPDATE', [req.user.id]);
      if (!rows.length) return { status: 404, body: { error: 'Primero elige tu compañero' } };
      if (rows[0].name === name) return { status: 400, body: { error: 'Ese ya es el nombre de tu compañero.' } };

      const free = rows[0].name_status === 'rejected';
      const cost = free ? 0 : petRenameCost();
      const tokens = free ? null : await spendTokens(client, { studentId: req.user.id, amount: cost, reason: 'pet_rename' });
      const { rows: updated } = await client.query(`
        UPDATE student_pets
        SET name = $2, name_status = 'pending', name_set_at = NOW(),
            name_reviewed_by = NULL, name_reviewed_at = NULL, updated_at = NOW()
        WHERE student_id = $1
        RETURNING ${PET_FIELDS}
      `, [req.user.id, name]);
      return { status: 200, body: { pet: updated[0], cost, tokens }, previous: rows[0].name, cost };
    });

    if (result.status === 200) {
      trackEvent({
        actorType: 'student', actorId: req.user.id, eventType: 'pet_renamed',
        payload: { from: result.previous, to: name, cost: result.cost },
      });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof InsufficientTokensError) return insufficientTokens(res, err);
    logger.error({ err }, 'rename pet error');
    res.status(500).json({ error: 'Error al cambiar el nombre' });
  }
});

// The home page celebrates a new stage once; this records that the student saw it.
router.post('/me/seen', authenticateToken, requireStudent, async (req, res) => {
  try {
    const growth = growthFor(await daysPlayed(req.user.id));
    const { rows } = await pool.query(`
      UPDATE student_pets SET stage_seen = GREATEST(stage_seen, $2) WHERE student_id = $1
      RETURNING ${PET_FIELDS}
    `, [req.user.id, growth.stage]);
    if (!rows.length) return res.status(404).json({ error: 'Primero elige tu compañero' });
    res.json({ pet: rows[0], growth });
  } catch (err) {
    logger.error({ err }, 'pet seen error');
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// ── Admin: review of pet names (same queue rules as character names) ────
router.get('/names', authenticateToken, requireAdmin, async (req, res) => {
  const status = req.query.status || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT p.student_id, p.name, p.name_status, p.name_set_at, p.name_reviewed_at, p.species,
             s.first_name, s.last_name, s.course_name
      FROM student_pets p JOIN local_students s ON s.id = p.student_id
      WHERE ($1 = 'all' OR p.name_status = $1)
      ORDER BY p.name_set_at DESC
      LIMIT 500
    `, [status]);
    res.json({ names: rows });
  } catch (err) {
    logger.error({ err }, 'list pet names error');
    res.status(500).json({ error: 'Error al obtener los nombres' });
  }
});

router.patch('/names/:studentId', authenticateToken, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  if (!/^[0-9a-f-]{36}$/i.test(req.params.studentId)) return res.status(404).json({ error: 'Compañero no encontrado' });
  try {
    const { rows } = await pool.query(`
      UPDATE student_pets SET name_status = $2, name_reviewed_by = $3, name_reviewed_at = NOW()
      WHERE student_id = $1
      RETURNING student_id, name, name_status
    `, [req.params.studentId, status, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Compañero no encontrado' });
    trackEvent({
      actorType: 'teacher', actorId: req.user.id, eventType: 'pet_name_reviewed',
      payload: { studentId: req.params.studentId, name: rows[0].name, status },
    });
    res.json({ pet: rows[0] });
  } catch (err) {
    logger.error({ err }, 'review pet name error');
    res.status(500).json({ error: 'Error al revisar el nombre' });
  }
});

module.exports = router;
