// Creates the test student account (or gives it a new PIN) and prints the PIN once.
// It sits in a real course so it can join that course's rooms and get its content,
// but is_test keeps it out of Anahuac sync, teachers' rosters and question ratings.
//
//   docker exec academia-backend node scripts/test-student.js [curso] [rut]
//
// Another RUT makes another test account, for a second tester. Its check digit need not be valid
// (11.111.111-2 was asked for, 2026-10-14): the RUT + PIN login does not check it, but joining a
// class room with a code does, so such an account only plays outside class.
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

// Classic Chilean test RUT: valid check digit, no student has it.
const DEFAULT_RUT = '11.111.111-1';
// Negative ids never collide with Anahuac's, whose ids are positive; each test RUT gets its own.
const anahuacIdFor = rut => (rut === DEFAULT_RUT ? -1 : -Number(rut.replace(/[^0-9]/g, '')));

async function main() {
  const course = process.argv[2] || '5°';
  const RUT = process.argv[3] || DEFAULT_RUT;
  const lastName = RUT === DEFAULT_RUT ? 'Prueba' : `Prueba ${RUT.slice(-1)}`;
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const pinHash = await bcrypt.hash(pin, 10);

  const { rows } = await pool.query(`
    INSERT INTO local_students (anahuac_id, rut, first_name, last_name, course_name, is_test, pin_hash, pin_updated_at)
    VALUES ($1, $2, 'Alumno', $5, $3, true, $4, NOW())
    ON CONFLICT (anahuac_id) DO UPDATE
      SET course_name = EXCLUDED.course_name, is_test = true, active = true, withdrawn_at = NULL,
          pin_hash = EXCLUDED.pin_hash, pin_updated_at = NOW(), updated_at = NOW()
    RETURNING id, course_name
  `, [anahuacIdFor(RUT), RUT, course, pinHash, lastName]);

  console.log(`Alumno de prueba en ${rows[0].course_name}: RUT ${RUT}, PIN ${pin}`);
}

main()
  .catch(err => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
