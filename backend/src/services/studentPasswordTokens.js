// One-time links to create or reset a student's password. Ported from Anahuac's
// utils/passwordTokens.js: the token travels only in the email and the database
// keeps its SHA-256 (32 random bytes need no slow hash and can be looked up by index).
const crypto = require('crypto');

const TTL_MS = 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const looksLikeToken = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

function tokenState(row, now = new Date()) {
  if (!row) return 'invalido';
  if (row.used_at) return 'usado';
  if (new Date(row.expires_at) <= now) return 'vencido';
  if (!row.active) return 'invalido';
  return 'valido';
}

// Issuing a new link expires the student's previous unused ones.
async function issueToken(db, studentId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    'UPDATE student_password_tokens SET expires_at = LEAST(expires_at, NOW()) WHERE student_id = $1 AND used_at IS NULL',
    [studentId]
  );
  await db.query(
    'INSERT INTO student_password_tokens (student_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [studentId, hashToken(token), new Date(Date.now() + TTL_MS)]
  );
  return token;
}

async function findToken(db, token) {
  if (!looksLikeToken(token)) return null;
  const { rows } = await db.query(`
    SELECT t.id, t.student_id, t.expires_at, t.used_at,
           s.first_name, s.institutional_email, s.active
    FROM student_password_tokens t
    JOIN local_students s ON s.id = t.student_id
    WHERE t.token_hash = $1
  `, [hashToken(token)]);
  return rows[0] || null;
}

// Marks the token used and sets the password in one transaction; the conditional
// UPDATE stops two simultaneous submits of the same link from setting two passwords.
async function consumeToken(client, { tokenId, studentId, passwordHash }) {
  const marked = await client.query(
    'UPDATE student_password_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING id',
    [tokenId]
  );
  if (marked.rowCount === 0) return false;
  await client.query(
    'UPDATE local_students SET password_hash = $1, password_set_at = NOW() WHERE id = $2',
    [passwordHash, studentId]
  );
  await client.query(
    'UPDATE student_password_tokens SET expires_at = LEAST(expires_at, NOW()) WHERE student_id = $1 AND used_at IS NULL',
    [studentId]
  );
  return true;
}

module.exports = { tokenState, issueToken, findToken, consumeToken };
