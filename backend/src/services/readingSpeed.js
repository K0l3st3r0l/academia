const pool = require('../db');
const logger = require('../logger');
const { inTransaction } = require('../db/transaction');
const { trackEvent } = require('./eventTracker');
const { getReadingSpeedByStudent } = require('./anahuacService');
const { giveCopihues } = require('./copihues');

// A student who reads faster than in their previous measurement gets copihues: the improvement
// counts, not the level, so a slow reader who advances is recognized too. Measurements come
// twice a year (LeoMejor) or from ProsodIA, so this is rare and worth more than a perfect level.
const READING_COPIHUES = 3;
// After a successful pass, automatic ones (at staff login) wait this long.
const AUTO_EVERY_MS = 6 * 60 * 60 * 1000;

let running = null;
let lastSuccess = 0;

function periodKey(m) {
  return `reading:${m.anio}-${m.semestre ?? 0}-${m.fecha ?? ''}`;
}

// Compares each measurement with the student's previous one. Only improvements measured this
// year or later pay, so the launch does not reach back to old school years.
function improvements(measurements, currentYear) {
  const byStudent = new Map();
  for (const m of measurements) {
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, []);
    byStudent.get(m.student_id).push(m);
  }
  const found = [];
  for (const [anahuacId, list] of byStudent) {
    list.sort((a, b) => a.anio - b.anio || (a.semestre ?? 0) - (b.semestre ?? 0) || (a.fecha ?? '').localeCompare(b.fecha ?? ''));
    for (let i = 1; i < list.length; i += 1) {
      const [before, now] = [list[i - 1], list[i]];
      if (now.anio >= currentYear && now.pcpm > before.pcpm) found.push({ anahuacId, before, now });
    }
  }
  return found;
}

async function syncReadingSpeed(anahuacToken, { currentYear = new Date().getFullYear() } = {}) {
  const measurements = await getReadingSpeedByStudent(anahuacToken, currentYear - 1);
  const found = improvements(measurements, currentYear);
  const ids = [...new Set(found.map(f => f.anahuacId))];
  const { rows: students } = await pool.query(
    'SELECT id, anahuac_id FROM local_students WHERE anahuac_id = ANY($1::int[])', [ids]
  );
  const local = new Map(students.map(s => [s.anahuac_id, s.id]));

  const awarded = await inTransaction(async client => {
    let count = 0;
    for (const { anahuacId, before, now } of found) {
      const studentId = local.get(anahuacId);
      if (!studentId) continue;
      const row = await giveCopihues(client, {
        studentId,
        amount: READING_COPIHUES,
        reason: 'reading',
        detail: `De ${Math.round(before.pcpm)} a ${Math.round(now.pcpm)} palabras por minuto`,
        sourceKey: periodKey(now),
      });
      if (row) count += 1;
    }
    return count;
  });

  const summary = { measurements: measurements.length, improvements: found.length, awarded };
  trackEvent({ actorType: 'system', eventType: 'reading_speed_sync', payload: summary });
  return summary;
}

// One pass at a time. `force` (the button in the teacher's page) skips the waiting time.
function runReadingSync(anahuacToken, { force = false } = {}) {
  if (running) return running;
  if (!force && Date.now() - lastSuccess < AUTO_EVERY_MS) return Promise.resolve(null);
  running = syncReadingSpeed(anahuacToken)
    .then(summary => { lastSuccess = Date.now(); return summary; })
    .finally(() => { running = null; });
  return running;
}

// At staff login, in the background: most staff lack the permission (403), which is expected.
function syncAfterLogin(anahuacToken) {
  runReadingSync(anahuacToken).catch(err => {
    const status = err.response?.status ?? err.statusCode;
    // 403: this staff member lacks the permission. 404: Anahuac without the endpoint yet.
    if (status === 403 || status === 404) return;
    logger.warn({ status, message: err.message }, 'reading speed sync failed');
  });
}

async function lastSync() {
  const { rows } = await pool.query(
    `SELECT created_at, payload FROM events WHERE event_type = 'reading_speed_sync' ORDER BY created_at DESC LIMIT 1`
  );
  return rows[0] ? { at: rows[0].created_at, ...rows[0].payload } : null;
}

function _reset() {
  running = null;
  lastSuccess = 0;
}

module.exports = { syncReadingSpeed, runReadingSync, syncAfterLogin, lastSync, improvements, READING_COPIHUES, _reset };
