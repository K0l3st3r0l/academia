const pool = require('../db');
const logger = require('../logger');
const { getActiveStudents } = require('./anahuacService');
const { institutionalEmail } = require('../utils/institutionalEmail');

// If Anahuac suddenly omits more than half of the students we know, a partial
// response is far more likely than a mass withdrawal: keep everyone active.
const MAX_WITHDRAWAL_RATIO = 0.5;
const MIN_WITHDRAWALS_TO_GUARD = 5;

function splitNames(s) {
  return {
    firstName: [s.nombre1, s.nombre2].filter(Boolean).join(' ').trim(),
    lastName: [s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ').trim(),
  };
}

/**
 * Brings local_students in line with Anahuac's active list:
 * - copies `courseName` (new students appear);
 * - follows students already known wherever they are now (course change, name or RUT fix);
 * - marks known students missing from the list as withdrawn, and reactivates them if they return.
 * Courses nobody uses are not copied, so AcademIA holds no personal data it has no use for.
 */
async function syncStudents(anahuacToken, courseName) {
  const activeStudents = await getActiveStudents(anahuacToken);
  if (!Array.isArray(activeStudents) || activeStudents.length === 0) {
    throw new Error('Anahuac devolvió una lista de alumnos vacía');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: known } = await client.query('SELECT anahuac_id, active FROM local_students WHERE NOT is_test');
    const knownActive = new Map(known.map(r => [r.anahuac_id, r.active]));
    const result = { added: 0, reactivated: 0, withdrawn: 0, withdrawalSkipped: false };

    const toUpsert = activeStudents.filter(s => s.curso === courseName || knownActive.has(s.id));
    for (const s of toUpsert) {
      if (!knownActive.has(s.id)) result.added += 1;
      else if (knownActive.get(s.id) === false) result.reactivated += 1;
    }

    if (toUpsert.length) {
      const names = toUpsert.map(splitNames);
      await client.query(`
        INSERT INTO local_students (anahuac_id, rut, first_name, last_name, course_name, institutional_email, updated_at)
        SELECT u.anahuac_id, u.rut, u.first_name, u.last_name, u.course_name, u.institutional_email, NOW()
        FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
          AS u(anahuac_id, rut, first_name, last_name, course_name, institutional_email)
        ON CONFLICT (anahuac_id) DO UPDATE
          SET rut = COALESCE(EXCLUDED.rut, local_students.rut),
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              course_name = EXCLUDED.course_name,
              institutional_email = EXCLUDED.institutional_email,
              active = true,
              withdrawn_at = NULL,
              updated_at = NOW()
      `, [
        toUpsert.map(s => s.id),
        toUpsert.map(s => s.rut || null),
        names.map(n => n.firstName),
        names.map(n => n.lastName),
        toUpsert.map(s => s.curso || null),
        toUpsert.map(institutionalEmail),
      ]);
    }

    const activeIds = new Set(activeStudents.map(s => s.id));
    const withdrawnIds = known.filter(r => r.active && !activeIds.has(r.anahuac_id)).map(r => r.anahuac_id);
    const activeCount = known.filter(r => r.active).length;
    const looksPartial = withdrawnIds.length > MIN_WITHDRAWALS_TO_GUARD
      && withdrawnIds.length > activeCount * MAX_WITHDRAWAL_RATIO;

    if (looksPartial) {
      result.withdrawalSkipped = true;
      logger.warn(`Student sync: ${withdrawnIds.length} of ${activeCount} known students missing from Anahuac, withdrawal skipped`);
    } else if (withdrawnIds.length) {
      await client.query(`
        UPDATE local_students
        SET active = false, withdrawn_at = NOW(), updated_at = NOW()
        WHERE anahuac_id = ANY($1::int[])
      `, [withdrawnIds]);
      result.withdrawn = withdrawnIds.length;
    }

    await client.query('COMMIT');
    if (result.added || result.reactivated || result.withdrawn || result.withdrawalSkipped) {
      logger.info(`Student sync (${courseName}): ${JSON.stringify(result)}`);
    }
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { syncStudents };
