import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTeacher, signToken, teacherPayload, createRoom, createGameSession, createStudent } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

describe('GET /api/rooms/history', () => {
  it('lista las salas del docente con sus sesiones', async () => {
    const teacher = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'matematica', status: 'closed' });
    await createGameSession(pool, { roomId: room.id, subject: 'matematica' });

    const token = signToken(teacherPayload(teacher));
    const res = await request(app).get('/api/rooms/history').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].code).toBe(room.code);
    expect(res.body[0].sessions).toHaveLength(1);
  });
});

describe('GET /api/sessions/:id', () => {
  it('devuelve el detalle de la sesión para el docente dueño de la sala', async () => {
    const teacher = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'matematica' });
    const session = await createGameSession(pool, { roomId: room.id, subject: 'matematica' });
    const student = await createStudent(pool, { courseName: '5° Básico A' });
    await pool.query(
      `INSERT INTO student_answers (session_id, student_id, question_index, answer, is_correct, time_taken_ms)
       VALUES ($1, $2, 0, 'A', true, 4200)`,
      [session.id, student.id]
    );

    const token = signToken(teacherPayload(teacher));
    const res = await request(app).get(`/api/sessions/${session.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(session.id);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].correct_answers).toBe(1);
  });

  it('devuelve 403 si la sesión pertenece a otro docente', async () => {
    const owner = await createTeacher(pool);
    const outsider = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: owner.id, courseName: '5° Básico A', subject: 'matematica' });
    const session = await createGameSession(pool, { roomId: room.id, subject: 'matematica' });

    const token = signToken(teacherPayload(outsider));
    const res = await request(app).get(`/api/sessions/${session.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('devuelve 404 si la sesión no existe', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));

    const res = await request(app)
      .get('/api/sessions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
