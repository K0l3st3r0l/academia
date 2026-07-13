import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, signToken, teacherPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

describe('gestión de PINs (docente)', () => {
  it('POST /api/students/:id/reset-pin sin token devuelve 401', async () => {
    const student = await createStudent(pool, { courseName: '4to Básico B' });
    const res = await request(app).post(`/api/students/${student.id}/reset-pin`);
    expect(res.status).toBe(401);
  });

  it('POST /api/students/:id/reset-pin requiere rol docente', async () => {
    const notTeacher = await createTeacher(pool, { roles: ['student'] });
    const token = signToken(teacherPayload(notTeacher));
    const student = await createStudent(pool, { courseName: '4to Básico B' });

    const res = await request(app)
      .post(`/api/students/${student.id}/reset-pin`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('el docente genera un PIN individual, se entrega en texto plano una sola vez', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));
    const student = await createStudent(pool, { courseName: '4to Básico B' });

    const res = await request(app)
      .post(`/api/students/${student.id}/reset-pin`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: student.id, pin: expect.stringMatching(/^\d{4}$/) });

    const { rows } = await pool.query('SELECT pin_hash, pin_updated_at FROM local_students WHERE id = $1', [student.id]);
    expect(rows[0].pin_hash).toBeTruthy();
    expect(rows[0].pin_hash).not.toBe(res.body.pin);
    expect(rows[0].pin_updated_at).toBeTruthy();
  });

  it('el docente genera PINs para todo un curso', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));
    await createStudent(pool, { courseName: '5to Básico C', firstName: 'Ana' });
    await createStudent(pool, { courseName: '5to Básico C', firstName: 'Beto' });
    await createStudent(pool, { courseName: '6to Básico A', firstName: 'Otro curso' });

    const res = await request(app)
      .post('/api/students/reset-pins-bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ course_name: '5to Básico C' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const entry of res.body) {
      expect(entry).toMatchObject({ id: expect.any(String), nombre: expect.any(String), pin: expect.stringMatching(/^\d{4}$/) });
    }
  });

  it('GET /api/students devuelve el estado de PIN sin exponer el hash', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));
    await createStudent(pool, { courseName: '5to Básico C', firstName: 'Ana' });

    const res = await request(app)
      .get('/api/students')
      .query({ course_name: '5to Básico C' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ has_pin: false });
    expect(res.body[0].pin_hash).toBeUndefined();
  });
});

describe('un alumno no puede acceder a endpoints de docente', () => {
  it('POST /api/rooms con token de alumno devuelve 403', async () => {
    const student = await createStudent(pool, { rut: '19444555-6', courseName: '6to Básico A' });
    const bcrypt = (await import('bcryptjs')).default;
    await pool.query('UPDATE local_students SET pin_hash = $1 WHERE id = $2', [await bcrypt.hash('1234', 10), student.id]);

    const loginRes = await request(app).post('/api/auth/student-login').send({ rut: '19444555-6', pin: '1234' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ course_name: '6to Básico A', subject: 'general' });

    expect(res.status).toBe(403);
  });
});
