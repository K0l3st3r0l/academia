import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createAnahuacStub } from '../helpers/anahuacStub.js';
import { createTeacher, signToken, teacherPayload, createRoom, createStudent } from '../helpers/fixtures.js';

const stub = createAnahuacStub();
process.env.ANAHUAC_API_URL = await stub.start();

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

afterAll(() => stub.stop());

async function loginTeacher({ anahuacId, email }) {
  stub.set('POST /api/users/login', () => ({ status: 200, body: { token: `anahuac-token-${anahuacId}` } }));
  stub.set('GET /api/users/me', () => ({
    status: 200,
    body: { id: anahuacId, email, first_name: 'Docente', last_name: 'Prueba', roles: ['teacher'] },
  }));
  const res = await request(app).post('/api/auth/login').send({ email, password: 'cualquiera' });
  return res.body;
}

describe('POST /api/rooms', () => {
  it('crea una sala con código único y sincroniza alumnos desde Anahuac', async () => {
    const { token } = await loginTeacher({ anahuacId: 5001, email: 'profe.rooms@colegio.cl' });
    stub.set('GET /api/students', () => ({
      status: 200,
      body: [
        { id: 9001, rut: '11.111.111-1', nombre1: 'Ana', nombre2: '', apellido_paterno: 'Pérez', apellido_materno: 'Soto', curso: '5° Básico A' },
        { id: 9002, rut: '22.222.222-2', nombre1: 'Otro', nombre2: '', apellido_paterno: 'De', apellido_materno: 'OtroCurso', curso: '6° Básico B' },
      ],
    }));

    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ course_name: '5° Básico A', subject: 'matematica' });

    expect(res.status).toBe(200);
    expect(res.body.room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(res.body.room.course_name).toBe('5° Básico A');
    expect(res.body.students).toHaveLength(1);

    const { rows } = await pool.query('SELECT * FROM local_students WHERE anahuac_id = $1', [9001]);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe('Ana');
  });

  it('devuelve 401 si no hay sesión de Anahuac cacheada', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));

    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ course_name: '5° Básico A', subject: 'matematica' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/rooms/:code', () => {
  it('devuelve la sala y sus alumnos', async () => {
    const teacher = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'matematica' });
    await createStudent(pool, { courseName: '5° Básico A', firstName: 'Bruno' });

    const res = await request(app).get(`/api/rooms/${room.code}`);

    expect(res.status).toBe(200);
    expect(res.body.room.code).toBe(room.code);
    expect(res.body.students.some(s => s.first_name === 'Bruno')).toBe(true);
  });

  it('devuelve 404 si la sala no existe', async () => {
    const res = await request(app).get('/api/rooms/ZZZZZZ');
    expect(res.status).toBe(404);
  });
});
