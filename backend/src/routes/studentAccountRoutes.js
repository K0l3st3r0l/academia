/**
 * A student creates or recovers their password with an emailed link, the same
 * flow Anahuac uses for staff (routes/passwordRoutes.js there).
 *
 *   POST /olvide   asks for a link. Same answer whether or not the email belongs
 *                  to a student, so it can't be used to learn who is enrolled.
 *   POST /enlace   says whether a link is still usable and whose it is.
 *   POST /crear    sets the password with a valid link and signs the student in.
 */
const logger = require('../logger');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { mailEnabled, sendMail } = require('../utils/mailer');
const { renderCreatePassword } = require('../utils/studentEmails');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');
const { tokenState, issueToken, findToken, consumeToken } = require('../services/studentPasswordTokens');
const { startStudentSession } = require('../services/studentSession');
const { trackEvent } = require('../services/eventTracker');

const router = express.Router();

const APP_URL = process.env.PUBLIC_APP_URL || 'https://games.laravas.com';
// Fragment, not query string: it never reaches server logs or the Referer header.
const passwordLink = (token) => `${APP_URL}/alumno/crear-clave#t=${token}`;

// Behind the proxy every request shares one IP, so a per-IP limit would lock out a
// whole class. Instead: 3 links per email per hour, plus a global cap that keeps
// Gmail's daily quota safe if someone scripts requests with real student emails.
const EMAIL_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
const GLOBAL_LIMIT = { max: 300, windowMs: 60 * 60 * 1000 };
const emailBuckets = new Map();
let globalBucket = { count: 0, until: 0 };

function takeLinkQuota(email) {
  const now = Date.now();
  if (globalBucket.until <= now) globalBucket = { count: 0, until: now + GLOBAL_LIMIT.windowMs };
  if (emailBuckets.size > 5000) {
    for (const [k, b] of emailBuckets) if (b.until <= now) emailBuckets.delete(k);
  }
  const bucket = emailBuckets.get(email);
  const current = bucket && bucket.until > now ? bucket : { count: 0, until: now + EMAIL_LIMIT.windowMs };
  if (current.count >= EMAIL_LIMIT.max || globalBucket.count >= GLOBAL_LIMIT.max) return false;
  current.count += 1;
  globalBucket.count += 1;
  emailBuckets.set(email, current);
  return true;
}

const STATE_MESSAGES = {
  invalido: 'El enlace no es válido. Pide uno nuevo en «Primera vez u olvidé mi contraseña».',
  vencido: 'El enlace venció. Pide uno nuevo en «Primera vez u olvidé mi contraseña».',
  usado: 'Este enlace ya se usó. Si no recuerdas tu contraseña, pide uno nuevo.',
};

const firstGivenName = (firstName) => (firstName || '').trim().split(/\s+/)[0] || '';

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/olvide', async (req, res) => {
  if (!mailEnabled()) {
    return res.status(503).json({ error: 'El envío de correos aún no está habilitado. Entra con tu RUT y PIN.' });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || email.length > 320 || !email.includes('@')) {
    return res.status(400).json({ error: 'Escribe tu correo del colegio' });
  }
  if (!takeLinkQuota(email)) {
    return res.status(429).json({ error: 'Ya pediste varios enlaces. Revisa tu correo o espera un rato antes de pedir otro.' });
  }

  const answer = { message: 'Si el correo es de un alumno, te llegará un enlace para crear tu contraseña. Revisa también la carpeta de spam.' };
  try {
    const { rows } = await pool.query(
      'SELECT id, first_name, institutional_email FROM local_students WHERE active AND lower(institutional_email) = $1',
      [email]
    );
    // Two active students with the same address is a duplicate record in Anahuac:
    // a link would let one of them set the other's password.
    if (rows.length !== 1) {
      if (rows.length > 1) logger.warn(`Password link refused: ${rows.length} active students share one institutional email`);
      return res.json(answer);
    }
    const student = rows[0];

    const token = await issueToken(pool, student.id);
    const mail = renderCreatePassword({
      firstName: firstGivenName(student.first_name),
      email: student.institutional_email,
      link: passwordLink(token),
    });
    trackEvent({ actorType: 'student', actorId: student.id, eventType: 'password_link_requested', payload: {} });
    // Not awaited: response time must not reveal whether the email exists.
    sendMail({ to: student.institutional_email, ...mail })
      .catch(err => logger.error(`Password link email failed (student ${student.id}):`, err.message));
    res.json(answer);
  } catch (err) {
    logger.error('Password link request error:', err.message);
    res.status(500).json({ error: 'No pudimos procesar la solicitud. Inténtalo de nuevo.' });
  }
});

router.post('/enlace', async (req, res) => {
  try {
    const row = await findToken(pool, req.body?.token);
    const state = tokenState(row);
    if (state !== 'valido') return res.json({ estado: state, error: STATE_MESSAGES[state] });
    res.json({ estado: state, nombre: firstGivenName(row.first_name), email: row.institutional_email });
  } catch (err) {
    logger.error('Password link check error:', err.message);
    res.status(500).json({ error: 'No pudimos revisar el enlace. Inténtalo de nuevo.' });
  }
});

router.post('/crear', async (req, res) => {
  const { token, password } = req.body || {};
  const policyError = validatePasswordPolicy(password);
  if (policyError) return res.status(400).json({ error: policyError });

  const client = await pool.connect();
  try {
    const row = await findToken(client, token);
    const state = tokenState(row);
    if (state !== 'valido') {
      return res.status(state === 'invalido' ? 404 : 410).json({ estado: state, error: STATE_MESSAGES[state] });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await client.query('BEGIN');
    const consumed = await consumeToken(client, { tokenId: row.id, studentId: row.student_id, passwordHash });
    if (!consumed) {
      await client.query('ROLLBACK');
      return res.status(410).json({ estado: 'usado', error: STATE_MESSAGES.usado });
    }
    await client.query('COMMIT');

    trackEvent({ actorType: 'student', actorId: row.student_id, eventType: 'password_set', payload: {} });
    const { rows } = await pool.query('SELECT * FROM local_students WHERE id = $1', [row.student_id]);
    // Whoever holds the link already proved they own the mailbox: sign them in directly.
    res.json(await startStudentSession(rows[0], 'password_link'));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Set student password error:', err.message);
    res.status(500).json({ error: 'No pudimos guardar tu contraseña. Inténtalo de nuevo.' });
  } finally {
    client.release();
  }
});

module.exports = router;
