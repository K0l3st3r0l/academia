import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createAnahuacStub } from '../helpers/anahuacStub.js';
import { createStudent, createTeacher, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const stub = createAnahuacStub();
process.env.ANAHUAC_API_URL = await stub.start();

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { improvements, _reset } = await import('../../src/services/readingSpeed.js');

afterAll(() => stub.stop());
beforeEach(() => { stub.reset(); _reset(); });

const YEAR = new Date().getFullYear();
const settle = () => new Promise(resolve => setTimeout(resolve, 150));
const m = (studentId, anio, semestre, pcpm, fecha = `${anio}-${semestre === 1 ? '05' : '11'}-10`) => ({ student_id: studentId, cruce: 'nombre', anio, semestre, fecha, pcpm });

// Logs a UTP in through Anahuac so AcademIA keeps its Anahuac session; the automatic pass at
// login finds no permission (403) and does nothing.
async function loginUtp() {
  stub.set('POST /api/users/login', () => ({ status: 200, body: { token: 'anahuac-utp' } }));
  stub.set('GET /api/users/me', () => ({ status: 200, body: { id: 8801, email: 'utp@colegio.cl', first_name: 'Ana', last_name: 'Utp', roles: ['utp'] } }));
  stub.set('GET /api/utp/velocidad-lectora/por-alumno', () => ({ status: 403, body: { error: 'sin permiso' } }));
  const res = await request(app).post('/api/auth/login').send({ email: 'utp@colegio.cl', password: 'x' });
  await settle();
  return `Bearer ${res.body.token}`;
}

describe('velocidad lectora → copihues', () => {
  it('cuenta solo las mejoras respecto de la medición anterior, medidas este año', () => {
    const found = improvements([
      m(1, YEAR - 1, 2, 80), m(1, YEAR, 1, 95),
      m(2, YEAR - 1, 2, 90), m(2, YEAR, 1, 85),
      m(3, YEAR - 2, 2, 50), m(3, YEAR - 1, 2, 70),
      m(4, YEAR, 1, 60), m(4, YEAR, 2, 61),
    ], YEAR);
    expect(found.map(f => [f.anahuacId, f.before.pcpm, f.now.pcpm])).toEqual([[1, 80, 95], [4, 60, 61]]);
  });

  it('premia una vez a quien mejoró, con el dato en el detalle; ignora alumnos que AcademIA no conoce', async () => {
    const auth = await loginUtp();
    const improved = await createStudent(pool, { anahuacId: 7101, courseName: '5° Básico A' });
    const declined = await createStudent(pool, { anahuacId: 7102, courseName: '5° Básico A' });
    stub.set('GET /api/utp/velocidad-lectora/por-alumno', () => ({
      status: 200,
      body: [m(7101, YEAR - 1, 2, 80.4), m(7101, YEAR, 1, 95), m(7102, YEAR - 1, 2, 90), m(7102, YEAR, 1, 85), m(7103, YEAR - 1, 2, 10), m(7103, YEAR, 1, 40)],
    }));

    const res = await request(app).post('/api/copihues/reading-sync').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ measurements: 6, improvements: 2, awarded: 1 });

    const me = await request(app).get('/api/copihues/me').set('Authorization', `Bearer ${signToken(studentPayload(improved))}`);
    expect(me.body.balance).toBe(3);
    expect(me.body.recent[0]).toMatchObject({ reason: 'reading', amount: 3, detail: 'De 80 a 95 palabras por minuto' });
    const other = await request(app).get('/api/copihues/me').set('Authorization', `Bearer ${signToken(studentPayload(declined))}`);
    expect(other.body.balance).toBe(0);

    const again = await request(app).post('/api/copihues/reading-sync').set('Authorization', auth);
    expect(again.body.summary.awarded).toBe(0);
    await settle();
    const last = await request(app).get('/api/copihues/reading-sync').set('Authorization', auth);
    expect(last.body.last).toMatchObject({ measurements: 6, awarded: 0 });
  });

  it('sin permiso en Anahuac o sin sesión, lo explica', async () => {
    const auth = await loginUtp();
    const denied = await request(app).post('/api/copihues/reading-sync').set('Authorization', auth);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('no_permission');

    stub.set('GET /api/utp/velocidad-lectora/por-alumno', () => ({ status: 404, body: {} }));
    const missing = await request(app).post('/api/copihues/reading-sync').set('Authorization', auth);
    expect(missing.body.code).toBe('not_available');

    const teacher = await createTeacher(pool);
    const noSession = await request(app).post('/api/copihues/reading-sync').set('Authorization', `Bearer ${signToken(teacherPayload(teacher))}`);
    expect(noSession.status).toBe(401);
  });
});
