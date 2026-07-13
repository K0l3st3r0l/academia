import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createStudent } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { _reset: resetRateLimiter } = await import('../../src/services/studentLoginRateLimiter.js');

async function setPin(studentId, pin) {
  const hash = await bcrypt.hash(pin, 10);
  await pool.query('UPDATE local_students SET pin_hash = $1 WHERE id = $2', [hash, studentId]);
}

beforeEach(() => {
  resetRateLimiter();
});

describe('POST /api/auth/student-login', () => {
  it('inicia sesión con RUT y PIN correctos', async () => {
    const student = await createStudent(pool, { rut: '12345678-9', courseName: '3ro Básico A' });
    await setPin(student.id, '1234');

    const res = await request(app).post('/api/auth/student-login').send({ rut: '12345678-9', pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.student).toMatchObject({
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      course_name: '3ro Básico A',
    });

    const { rows } = await pool.query('SELECT last_login_at FROM local_students WHERE id = $1', [student.id]);
    expect(rows[0].last_login_at).toBeTruthy();
  });

  it('acepta el RUT en distintos formatos (con puntos, guión y K minúscula/mayúscula)', async () => {
    const student = await createStudent(pool, { rut: '11222333-K', courseName: '3ro Básico A' });
    await setPin(student.id, '4321');

    const variants = ['11222333-K', '11.222.333-K', '11222333k', '11.222.333-k', '112223 33 K'];
    for (const rut of variants) {
      resetRateLimiter();
      const res = await request(app).post('/api/auth/student-login').send({ rut, pin: '4321' });
      expect(res.status).toBe(200);
    }
  });

  it('devuelve 401 con PIN incorrecto sin revelar la causa', async () => {
    const student = await createStudent(pool, { rut: '20111222-3', courseName: '3ro Básico A' });
    await setPin(student.id, '1234');

    const res = await request(app).post('/api/auth/student-login').send({ rut: '20111222-3', pin: '9999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('RUT o PIN incorrecto');
  });

  it('devuelve 401 genérico también cuando el RUT no existe', async () => {
    const res = await request(app).post('/api/auth/student-login').send({ rut: '9999999-9', pin: '1234' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('RUT o PIN incorrecto');
  });

  it('devuelve 403 si el alumno no tiene PIN asignado', async () => {
    const student = await createStudent(pool, { rut: '20333444-5', courseName: '3ro Básico A' });
    const res = await request(app).post('/api/auth/student-login').send({ rut: '20333444-5', pin: '1234' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Tu profesor aún no te asigna un PIN');
  });

  it('bloquea con 429 tras 5 intentos fallidos en la ventana de 15 minutos', async () => {
    const student = await createStudent(pool, { rut: '20555666-7', courseName: '3ro Básico A' });
    await setPin(student.id, '1234');

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/student-login').send({ rut: '20555666-7', pin: '0000' });
      expect(res.status).toBe(401);
    }

    const res = await request(app).post('/api/auth/student-login').send({ rut: '20555666-7', pin: '1234' });
    expect(res.status).toBe(429);
  });

  it('devuelve 400 si faltan RUT o PIN', async () => {
    const res = await request(app).post('/api/auth/student-login').send({ rut: '12345678-9' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/student-me', () => {
  it('requiere autenticación', async () => {
    const res = await request(app).get('/api/auth/student-me');
    expect(res.status).toBe(401);
  });

  it('devuelve el perfil fresco del alumno autenticado', async () => {
    const student = await createStudent(pool, { rut: '20777888-9', courseName: '4to Básico B', tokensBalance: 15 });
    await setPin(student.id, '5678');

    const loginRes = await request(app).post('/api/auth/student-login').send({ rut: '20777888-9', pin: '5678' });
    const token = loginRes.body.token;

    const res = await request(app).get('/api/auth/student-me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.student).toMatchObject({ id: student.id, tokens_balance: 15 });
  });
});
