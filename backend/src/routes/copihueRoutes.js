const express = require('express');
const pool = require('../db');
const logger = require('../logger');
const { authenticateToken, requireStudent, requireTeacher } = require('../middleware/auth');
const { inTransaction } = require('../db/transaction');
const { trackEvent } = require('../services/eventTracker');
const { giveCopihues, MAX_TEACHER_AWARD } = require('../services/copihues');

const router = express.Router();

const MAX_REASON = 120;
const UNDO_HOURS = 24;
const RECENT_DAYS = 30;
const UUID = /^[0-9a-f-]{36}$/i;

// The giver's names go separately: the app shows them short («Mauricio Rehbein»).
const LEDGER_FIELDS = `
  l.id, l.amount, l.reason, l.detail, l.created_at, l.seen_at,
  u.first_name AS giver_first_name, u.last_name AS giver_last_name`;

// The student's copihues: balance, the latest ones and the teacher awards not seen yet.
router.get('/me', authenticateToken, requireStudent, async (req, res) => {
  try {
    const [{ rows: [student] }, { rows: recent }] = await Promise.all([
      pool.query('SELECT copihues_balance FROM local_students WHERE id = $1', [req.user.id]),
      pool.query(
        `SELECT ${LEDGER_FIELDS} FROM copihue_ledger l LEFT JOIN local_users u ON u.id = l.awarded_by
         WHERE l.student_id = $1 AND l.amount > 0 ORDER BY l.created_at DESC LIMIT 20`,
        [req.user.id]
      ),
    ]);
    res.json({
      balance: student?.copihues_balance ?? 0,
      recent,
      unseen: recent.filter(r => r.reason === 'teacher' && !r.seen_at),
    });
  } catch (err) {
    logger.error({ err }, 'copihues me error');
    res.status(500).json({ error: 'Error al cargar tus copihues' });
  }
});

router.post('/me/seen', authenticateToken, requireStudent, async (req, res) => {
  await pool.query('UPDATE copihue_ledger SET seen_at = NOW() WHERE student_id = $1 AND seen_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

// A teacher recognizes one or more students: 1 to 3 copihues each, always with a reason.
router.post('/awards', authenticateToken, requireTeacher, async (req, res) => {
  const { studentIds, amount = 1, reason } = req.body || {};
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (!Array.isArray(studentIds) || !studentIds.length || studentIds.some(id => !UUID.test(id))) {
    return res.status(400).json({ error: 'Elige al menos un alumno' });
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TEACHER_AWARD) {
    return res.status(400).json({ error: `Se entregan de 1 a ${MAX_TEACHER_AWARD} copihues a la vez` });
  }
  if (!why) return res.status(400).json({ error: 'Escribe por qué lo reconoces' });
  if (why.length > MAX_REASON) return res.status(400).json({ error: `El motivo puede tener hasta ${MAX_REASON} caracteres` });

  try {
    const ids = [...new Set(studentIds)];
    const result = await inTransaction(async client => {
      const { rows: students } = await client.query(
        'SELECT id FROM local_students WHERE id = ANY($1::uuid[]) AND active', [ids]
      );
      if (students.length !== ids.length) return { status: 404, body: { error: 'Algún alumno no existe o ya no está activo' } };
      const awards = [];
      for (const id of ids) {
        awards.push({ studentId: id, ...await giveCopihues(client, { studentId: id, amount, reason: 'teacher', detail: why, awardedBy: req.user.id }) });
      }
      return { status: 201, body: { awards } };
    });
    if (result.status === 201) {
      trackEvent({ actorType: 'teacher', actorId: req.user.id, eventType: 'copihues_awarded', payload: { students: ids.length, amount, reason: why } });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error({ err }, 'copihues award error');
    res.status(500).json({ error: 'Error al entregar los copihues' });
  }
});

// Teacher awards of the last 30 days in a course, and how many each student got: so the teacher
// sees who has not been recognized yet.
router.get('/awards', authenticateToken, requireTeacher, async (req, res) => {
  const { course_name: course } = req.query;
  if (!course) return res.status(400).json({ error: 'course_name es requerido' });
  const isAdmin = req.user.roles?.includes('admin');
  try {
    const { rows } = await pool.query(
      `SELECT ${LEDGER_FIELDS}, l.student_id, l.awarded_by, s.first_name, s.last_name,
              (l.created_at > NOW() - make_interval(hours => $3)) AS recent_enough
       FROM copihue_ledger l
       JOIN local_students s ON s.id = l.student_id
       LEFT JOIN local_users u ON u.id = l.awarded_by
       WHERE s.course_name = $1 AND l.reason = 'teacher' AND l.created_at > NOW() - make_interval(days => $2)
       ORDER BY l.created_at DESC`,
      [course, RECENT_DAYS, UNDO_HOURS]
    );
    const perStudent = {};
    for (const r of rows) perStudent[r.student_id] = (perStudent[r.student_id] ?? 0) + r.amount;
    res.json({
      awards: rows.map(({ recent_enough: recentEnough, awarded_by: by, ...r }) => ({
        ...r, canUndo: recentEnough && (by === req.user.id || isAdmin),
      })),
      perStudent,
    });
  } catch (err) {
    logger.error({ err }, 'copihues awards list error');
    res.status(500).json({ error: 'Error al cargar los reconocimientos' });
  }
});

// Undo a mistaken award: the author (or an admin) within 24 hours, if the student still has them.
router.delete('/awards/:id', authenticateToken, requireTeacher, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Reconocimiento no encontrado' });
  const isAdmin = req.user.roles?.includes('admin');
  try {
    const result = await inTransaction(async client => {
      const { rows } = await client.query(
        `SELECT id, student_id, amount, awarded_by, (created_at > NOW() - make_interval(hours => $2)) AS recent_enough
         FROM copihue_ledger WHERE id = $1 AND reason = 'teacher' FOR UPDATE`,
        [req.params.id, UNDO_HOURS]
      );
      const award = rows[0];
      if (!award) return { status: 404, body: { error: 'Reconocimiento no encontrado' } };
      if (award.awarded_by !== req.user.id && !isAdmin) return { status: 403, body: { error: 'Solo quien lo entregó puede deshacerlo' } };
      if (!award.recent_enough) return { status: 409, body: { error: `Solo se puede deshacer dentro de ${UNDO_HOURS} horas` } };
      const { rowCount } = await client.query(
        'UPDATE local_students SET copihues_balance = copihues_balance - $2 WHERE id = $1 AND copihues_balance >= $2',
        [award.student_id, award.amount]
      );
      if (!rowCount) return { status: 409, body: { error: 'El alumno ya los canjeó' } };
      await client.query('DELETE FROM copihue_ledger WHERE id = $1', [award.id]);
      return { status: 200, body: { deleted: award.id } };
    });
    if (result.status === 200) trackEvent({ actorType: 'teacher', actorId: req.user.id, eventType: 'copihues_award_undone', payload: { id: req.params.id } });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error({ err }, 'copihues undo error');
    res.status(500).json({ error: 'Error al deshacer el reconocimiento' });
  }
});

module.exports = router;
