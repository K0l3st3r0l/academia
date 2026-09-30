import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createAnahuacStub } from '../helpers/anahuacStub.js';
import { createTeacher, signToken, teacherPayload, createRoom, createStudent } from '../helpers/fixtures.js';

const stub = createAnahuacStub();
process.env.ANAHUAC_API_URL = await stub.start();

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { verifyRoomTicket } = await import('../../src/services/roomTicket.js');

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
  it('devuelve la sala sin la lista de alumnos', async () => {
    const teacher = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'matematica' });
    await createStudent(pool, { courseName: '5° Básico A', firstName: 'Bruno' });

    const res = await request(app).get(`/api/rooms/${room.code}`);

    expect(res.status).toBe(200);
    expect(res.body.room.code).toBe(room.code);
    expect(res.body.students).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Bruno');
  });

  it('devuelve 404 si la sala no existe', async () => {
    const res = await request(app).get('/api/rooms/ZZZZZZ');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/rooms/open', () => {
  it('lista las salas en espera o en juego de las últimas horas, la más nueva primero', async () => {
    const teacher = await createTeacher(pool);
    const older = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'ciencias', status: 'active' });
    await pool.query("UPDATE rooms SET created_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [older.id]);
    const newer = await createRoom(pool, { teacherId: teacher.id, courseName: '6° Básico B', subject: 'matematica', status: 'waiting' });
    const closed = await createRoom(pool, { teacherId: teacher.id, courseName: '4° Básico A', subject: 'lenguaje', status: 'closed' });
    const forgotten = await createRoom(pool, { teacherId: teacher.id, courseName: '3° Básico A', subject: 'historia', status: 'waiting' });
    await pool.query("UPDATE rooms SET created_at = NOW() - INTERVAL '2 days' WHERE id = $1", [forgotten.id]);

    const res = await request(app).get('/api/rooms/open');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.rooms.map(r => r.code)).toEqual([newer.code, older.code]);
    expect(res.body.rooms[0]).toEqual({
      code: newer.code,
      course_name: '6° Básico B',
      subject: 'matematica',
      status: 'waiting',
      created_at: expect.any(String),
    });
    expect(res.body.rooms.map(r => r.code)).not.toContain(closed.code);
  });
});

describe('POST /api/rooms/:code/join', () => {
  async function seedRoomWithStudent() {
    const teacher = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'matematica' });
    const student = await createStudent(pool, { courseName: '5° Básico A', firstName: 'Bruno', lastName: 'Díaz', rut: '12.345.678-5' });
    await createStudent(pool, { courseName: '6° Básico B', firstName: 'Clara', rut: '11.111.111-1' });
    return { room, student };
  }

  it('identifica al alumno por su RUT, con o sin puntos y guion, y entrega un ticket de esa sala', async () => {
    const { room, student } = await seedRoomWithStudent();

    const res = await request(app).post(`/api/rooms/${room.code.toLowerCase()}/join`).send({ rut: '123456785' });

    expect(res.status).toBe(200);
    expect(res.body.student).toEqual({ firstName: 'Bruno', displayName: 'Bruno Díaz' });
    const ticket = verifyRoomTicket(res.body.ticket);
    expect(ticket.studentId).toBe(student.id);
    expect(ticket.roomCode).toBe(room.code);
  });

  it('acepta el IPE de nueve dígitos de un alumno extranjero', async () => {
    const { room } = await seedRoomWithStudent();
    await createStudent(pool, { courseName: '5° Básico A', firstName: 'Dana', lastName: 'Ruiz', rut: '100.123.456-7' });

    const res = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '100123456-7' });
    expect(res.status).toBe(200);
    expect(res.body.student.displayName).toBe('Dana Ruiz');
  });

  it('el ticket no sirve como sesión de la API', async () => {
    const { room } = await seedRoomWithStudent();
    const { body } = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '12.345.678-5' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.ticket}`);
    expect([401, 403]).toContain(res.status);
  });

  it('rechaza un RUT con dígito verificador incorrecto sin contarlo como intento', async () => {
    const { room } = await seedRoomWithStudent();

    for (let i = 0; i < 45; i += 1) {
      const res = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '12.345.678-9' });
      expect(res.status).toBe(400);
    }
    const ok = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '12.345.678-5' });
    expect(ok.status).toBe(200);
  });

  it('rechaza un RUT de otro curso o de un alumno retirado', async () => {
    const { room, student } = await seedRoomWithStudent();

    const otherCourse = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '11.111.111-1' });
    expect(otherCourse.status).toBe(404);
    expect(otherCourse.body.ticket).toBeUndefined();

    await pool.query('UPDATE local_students SET active = false WHERE id = $1', [student.id]);
    const withdrawn = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '12.345.678-5' });
    expect(withdrawn.status).toBe(404);
  });

  it('bloquea la sala tras muchos RUT que no son del curso', async () => {
    const { room } = await seedRoomWithStudent();

    for (let i = 0; i < 40; i += 1) {
      await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '11.111.111-1' });
    }
    const res = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '12.345.678-5' });
    expect(res.status).toBe(429);
  });

  it('devuelve 404 si la sala está cerrada', async () => {
    const { room } = await seedRoomWithStudent();
    await pool.query("UPDATE rooms SET status = 'closed' WHERE id = $1", [room.id]);

    const res = await request(app).post(`/api/rooms/${room.code}/join`).send({ rut: '12.345.678-5' });
    expect(res.status).toBe(404);
  });
});
