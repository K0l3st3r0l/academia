import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

let seq = 0;
function unique() {
  seq += 1;
  return `${Date.now()}_${seq}`;
}

export async function createTeacher(pool, overrides = {}) {
  const { rows } = await pool.query(`
    INSERT INTO local_users (anahuac_id, email, first_name, last_name, roles)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    overrides.anahuacId ?? Math.floor(Math.random() * 1_000_000_000),
    overrides.email ?? `teacher_${unique()}@test.local`,
    overrides.firstName ?? 'Docente',
    overrides.lastName ?? 'De Prueba',
    overrides.roles ?? ['teacher'],
  ]);
  return rows[0];
}

export async function createStudent(pool, overrides = {}) {
  const { rows } = await pool.query(`
    INSERT INTO local_students (anahuac_id, rut, first_name, last_name, course_name, tokens_balance)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    overrides.anahuacId ?? Math.floor(Math.random() * 1_000_000_000),
    overrides.rut ?? null,
    overrides.firstName ?? 'Alumno',
    overrides.lastName ?? unique(),
    overrides.courseName,
    overrides.tokensBalance ?? 0,
  ]);
  return rows[0];
}

function randomCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function createRoom(pool, { teacherId, courseName, subject, status = 'waiting', code } = {}) {
  const { rows } = await pool.query(`
    INSERT INTO rooms (code, teacher_id, course_name, subject, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [code ?? randomCode(), teacherId, courseName, subject, status]);
  return rows[0];
}

export async function createQuestion(pool, { subject, gradeLevel, difficulty = 'medium', text, options, correct, hint = null } = {}) {
  const { rows } = await pool.query(`
    INSERT INTO questions (subject, grade_level, difficulty, text, options, correct, hint, active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, true)
    RETURNING *
  `, [subject, gradeLevel, difficulty, text ?? `Pregunta ${unique()}`, JSON.stringify(options), correct, hint]);
  return rows[0];
}

export async function createGameSession(pool, { roomId, gameType = 'quiz_battle', subject, startedAt, endedAt = null, summary = null } = {}) {
  const { rows } = await pool.query(`
    INSERT INTO game_sessions (room_id, game_type, subject, started_at, ended_at, summary)
    VALUES ($1, $2, $3, COALESCE($4, NOW()), $5, $6)
    RETURNING *
  `, [roomId, gameType, subject, startedAt ?? null, endedAt, summary ? JSON.stringify(summary) : null]);
  return rows[0];
}

export function signToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h', ...options });
}

export function teacherPayload(teacherRow, overrides = {}) {
  return {
    id: teacherRow.id,
    anahuac_id: teacherRow.anahuac_id,
    email: teacherRow.email,
    first_name: teacherRow.first_name,
    last_name: teacherRow.last_name,
    roles: teacherRow.roles,
    ...overrides,
  };
}

export function studentPayload(studentRow, overrides = {}) {
  return {
    id: studentRow.id,
    roles: ['student'],
    first_name: studentRow.first_name,
    last_name: studentRow.last_name,
    ...overrides,
  };
}
