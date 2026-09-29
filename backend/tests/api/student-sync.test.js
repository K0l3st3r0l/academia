import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createAnahuacStub } from '../helpers/anahuacStub.js';
import { createStudent, createTeacher, signToken, teacherPayload } from '../helpers/fixtures.js';

const stub = createAnahuacStub();
process.env.ANAHUAC_API_URL = await stub.start();

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { _reset: resetRateLimiter } = await import('../../src/services/studentLoginRateLimiter.js');

afterAll(() => stub.stop());
beforeEach(() => resetRateLimiter());

const COURSE = '4° Básico A';

function anahuacStudent(id, overrides = {}) {
  return {
    id,
    rut: `${id}-5`,
    nombre1: 'Nombre',
    nombre2: '',
    apellido_paterno: `Paterno${id}`,
    apellido_materno: 'Materno',
    curso: COURSE,
    ...overrides,
  };
}

function anahuacReturns(students) {
  stub.set('GET /api/students', () => ({ status: 200, body: students }));
}

async function loginTeacher(anahuacId = 7001) {
  stub.set('POST /api/users/login', () => ({ status: 200, body: { token: `anahuac-token-${anahuacId}` } }));
  stub.set('GET /api/users/me', () => ({
    status: 200,
    body: { id: anahuacId, email: `profe${anahuacId}@colegio.cl`, first_name: 'Docente', last_name: 'Prueba', roles: ['teacher'] },
  }));
  const res = await request(app).post('/api/auth/login').send({ email: `profe${anahuacId}@colegio.cl`, password: 'x' });
  return res.body.token;
}

async function openPinList(token, course = COURSE) {
  return request(app).get('/api/students').query({ course_name: course }).set('Authorization', `Bearer ${token}`);
}

async function studentByAnahuacId(anahuacId) {
  const { rows } = await pool.query('SELECT * FROM local_students WHERE anahuac_id = $1', [anahuacId]);
  return rows[0];
}

describe('sincronización de alumnos con Anahuac', () => {
  it('abrir la lista de PINs copia el curso sin tener que crear una sala', async () => {
    const token = await loginTeacher();
    anahuacReturns([
      anahuacStudent(101, { nombre1: 'Ana', nombre2: 'María', apellido_paterno: 'Pérez', apellido_materno: 'Soto' }),
      anahuacStudent(102, { curso: '6° Básico B' }),
    ]);

    const res = await openPinList(token);

    expect(res.status).toBe(200);
    expect(res.body.sync).toMatchObject({ ok: true, added: 1 });
    expect(res.body.students).toHaveLength(1);
    // Second given name belongs to first_name, not to the surnames.
    expect(res.body.students[0]).toMatchObject({ first_name: 'Ana María', last_name: 'Pérez Soto' });
    // A course nobody uses is not copied.
    expect(await studentByAnahuacId(102)).toBeUndefined();
  });

  it('marca como retirado a quien ya no está activo, sin borrar su historial, y lo reactiva si vuelve', async () => {
    const token = await loginTeacher();
    anahuacReturns([anahuacStudent(201), anahuacStudent(202), anahuacStudent(203)]);
    await openPinList(token);

    anahuacReturns([anahuacStudent(201), anahuacStudent(202)]);
    const afterWithdrawal = await openPinList(token);
    expect(afterWithdrawal.body.sync).toMatchObject({ ok: true, withdrawn: 1 });
    expect(afterWithdrawal.body.students.map(s => s.last_name)).not.toContain('Paterno203 Materno');
    const withdrawn = await studentByAnahuacId(203);
    expect(withdrawn).toMatchObject({ active: false });
    expect(withdrawn.withdrawn_at).toBeTruthy();

    anahuacReturns([anahuacStudent(201), anahuacStudent(202), anahuacStudent(203)]);
    const afterReturn = await openPinList(token);
    expect(afterReturn.body.sync).toMatchObject({ reactivated: 1 });
    expect(await studentByAnahuacId(203)).toMatchObject({ active: true, withdrawn_at: null });
  });

  it('sigue al alumno que cambia de curso', async () => {
    const token = await loginTeacher();
    anahuacReturns([anahuacStudent(301)]);
    await openPinList(token);

    anahuacReturns([anahuacStudent(301, { curso: '4° Básico B' })]);
    const res = await openPinList(token);

    expect(res.body.students).toHaveLength(0);
    expect(await studentByAnahuacId(301)).toMatchObject({ course_name: '4° Básico B', active: true });
  });

  it('no retira a nadie si Anahuac omite a más de la mitad (respuesta parcial)', async () => {
    const token = await loginTeacher();
    const full = Array.from({ length: 10 }, (_, i) => anahuacStudent(400 + i));
    anahuacReturns(full);
    await openPinList(token);

    anahuacReturns(full.slice(0, 3));
    const res = await openPinList(token);

    expect(res.body.sync).toMatchObject({ ok: true, withdrawn: 0, withdrawalSkipped: true });
    expect(res.body.students).toHaveLength(10);
  });

  it('una lista vacía de Anahuac no retira a nadie y devuelve la última lista conocida', async () => {
    const token = await loginTeacher();
    anahuacReturns([anahuacStudent(501)]);
    await openPinList(token);

    anahuacReturns([]);
    const res = await openPinList(token);

    expect(res.body.sync).toMatchObject({ ok: false, reason: 'anahuac_error' });
    expect(res.body.students).toHaveLength(1);
  });

  it('sin sesión de Anahuac en caché devuelve la lista local y avisa', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));
    await createStudent(pool, { courseName: COURSE, firstName: 'Local' });

    const res = await openPinList(token);

    expect(res.status).toBe(200);
    expect(res.body.sync).toEqual({ ok: false, reason: 'no_session' });
    expect(res.body.students).toHaveLength(1);
  });

  it('el curso de la sala excluye a los retirados', async () => {
    const token = await loginTeacher();
    anahuacReturns([anahuacStudent(601), anahuacStudent(602)]);
    await openPinList(token);
    anahuacReturns([anahuacStudent(601)]);

    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ course_name: COURSE, subject: 'matematica' });

    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    const roster = await request(app).get(`/api/rooms/${res.body.room.code}`);
    expect(roster.body.students).toHaveLength(1);
  });
});

describe('alumno retirado', () => {
  it('no puede iniciar sesión aunque su PIN sea correcto', async () => {
    const student = await createStudent(pool, { courseName: COURSE, rut: '12.345.678-5' });
    await pool.query('UPDATE local_students SET pin_hash = $1, active = false WHERE id = $2', [await bcrypt.hash('4821', 10), student.id]);

    const res = await request(app).post('/api/auth/student-login').send({ rut: '12345678-5', pin: '4821' });

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it('con PIN incorrecto recibe el mismo 401 genérico que cualquiera', async () => {
    const student = await createStudent(pool, { courseName: COURSE, rut: '12.345.678-5' });
    await pool.query('UPDATE local_students SET pin_hash = $1, active = false WHERE id = $2', [await bcrypt.hash('4821', 10), student.id]);

    const res = await request(app).post('/api/auth/student-login').send({ rut: '12345678-5', pin: '0000' });

    expect(res.status).toBe(401);
  });

  it('pierde el acceso a su perfil aunque tenga un token vigente', async () => {
    const student = await createStudent(pool, { courseName: COURSE, rut: '12.345.678-5' });
    await pool.query('UPDATE local_students SET pin_hash = $1 WHERE id = $2', [await bcrypt.hash('4821', 10), student.id]);
    const login = await request(app).post('/api/auth/student-login').send({ rut: '12345678-5', pin: '4821' });
    await pool.query('UPDATE local_students SET active = false WHERE id = $1', [student.id]);

    const res = await request(app).get('/api/auth/student-me').set('Authorization', `Bearer ${login.body.token}`);

    expect(res.status).toBe(404);
  });
});
