import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { startTestServer } from '../helpers/socketServer.js';
import { createTeacher, createStudent, createRoom, createQuestion, signToken, teacherPayload } from '../helpers/fixtures.js';

const { default: pool } = await import('../../src/db/index.js');

let testServer;

beforeAll(async () => {
  testServer = await startTestServer();
});

afterAll(async () => {
  await testServer.close();
});

function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = ioClient(testServer.url, { transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe('POST /api/rooms/:id/close', () => {
  it('devuelve 403 si el docente no es el dueño de la sala', async () => {
    const owner = await createTeacher(pool);
    const other = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: owner.id, courseName: '5° Básico A', subject: 'matematica' });
    const token = signToken(teacherPayload(other));

    const res = await request(testServer.server)
      .post(`/api/rooms/${room.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);

    const { rows } = await pool.query('SELECT status FROM rooms WHERE id = $1', [room.id]);
    expect(rows[0].status).not.toBe('closed');
  });

  it('devuelve 404 si la sala no existe', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));

    const res = await request(testServer.server)
      .post('/api/rooms/00000000-0000-0000-0000-000000000000/close')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('cierra una sala sin partida activa: marca status y closed_at', async () => {
    const teacher = await createTeacher(pool);
    const room = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'matematica', status: 'waiting' });
    const token = signToken(teacherPayload(teacher));

    const res = await request(testServer.server)
      .post(`/api/rooms/${room.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.room.status).toBe('closed');
    expect(res.body.room.closed_at).not.toBeNull();

    const { rows } = await pool.query('SELECT status, closed_at FROM rooms WHERE id = $1', [room.id]);
    expect(rows[0].status).toBe('closed');
    expect(rows[0].closed_at).not.toBeNull();
  });

  it('termina limpiamente una partida activa en memoria y notifica a los alumnos conectados', async () => {
    const teacher = await createTeacher(pool);
    const courseName = '5° Básico A';
    const student = await createStudent(pool, { courseName, firstName: 'Alumno Cierre' });
    const room = await createRoom(pool, { teacherId: teacher.id, courseName, subject: 'matematica', status: 'waiting' });
    await createQuestion(pool, {
      subject: 'matematica',
      gradeLevel: '5b',
      options: ['Uno', 'Dos', 'Tres', 'Cuatro'],
      correct: 'Uno',
    });

    const teacherSocket = await connectClient();
    const studentSocket = await connectClient();
    const teacherToken = signToken(teacherPayload(teacher));

    const teacherJoinedP = once(teacherSocket, 'room:joined');
    teacherSocket.emit('teacher:join', { token: teacherToken, roomCode: room.code });
    await teacherJoinedP;

    const studentJoinedP = once(studentSocket, 'room:joined');
    studentSocket.emit('student:join', { roomCode: room.code, studentDbId: student.id, displayName: 'Alumno Cierre' });
    await studentJoinedP;

    const startedP = once(teacherSocket, 'game:started');
    const questionP = once(studentSocket, 'game:question');
    teacherSocket.emit('game:start', { roomCode: room.code });
    await startedP;
    await questionP;

    const gameEndP = once(studentSocket, 'game:end');
    const res = await request(testServer.server)
      .post(`/api/rooms/${room.id}/close`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.room.status).toBe('closed');

    const gameEnd = await gameEndP;
    expect(gameEnd.summary.totalStudents).toBe(1);

    const { rows } = await pool.query('SELECT status, closed_at FROM rooms WHERE id = $1', [room.id]);
    expect(rows[0].status).toBe('closed');
    expect(rows[0].closed_at).not.toBeNull();

    teacherSocket.disconnect();
    studentSocket.disconnect();
  });
});
