const jwt = require('jsonwebtoken');
const pool = require('../db');
const { trackEvent } = require('./eventTracker');

// Shared by every way a student can get in (RUT + PIN, email + password, a password link).
async function startStudentSession(student, method) {
  await pool.query('UPDATE local_students SET last_login_at = NOW() WHERE id = $1', [student.id]);

  const token = jwt.sign(
    { id: student.id, roles: ['student'], first_name: student.first_name, last_name: student.last_name },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  trackEvent({ actorType: 'student', actorId: student.id, eventType: 'student_login_success', payload: { method } });

  return {
    token,
    student: {
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      course_name: student.course_name,
      tokens_balance: student.tokens_balance,
    },
  };
}

module.exports = { startStudentSession };
