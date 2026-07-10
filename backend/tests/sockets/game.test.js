import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { startTestServer } from '../helpers/socketServer.js';
import { createTeacher, createStudent, createRoom, createQuestion, signToken } from '../helpers/fixtures.js';

const { default: pool } = await import('../../src/db/index.js');

let testServer;

beforeAll(async () => {
  testServer = await startTestServer();
});

afterAll(async () => {
  await testServer.close();
});

// gameSocket's disconnect handler fires a fire-and-forget trackEvent() write.
// Give it a moment to land before the next test's beforeEach TRUNCATEs the
// tables — otherwise that insert can race the truncate and log a spurious
// FK violation (harmless, but it's a real non-determinism risk to close off).
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
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

function teacherJoin(socket, token, roomCode) {
  const joined = once(socket, 'room:joined');
  socket.emit('teacher:join', { token, roomCode });
  return joined;
}

function studentJoin(socket, roomCode, studentDbId, displayName) {
  const joined = once(socket, 'room:joined');
  socket.emit('student:join', { roomCode, studentDbId, displayName });
  return joined;
}

async function seedSingleQuestionGame({ subject }) {
  const courseName = '5° Básico A';
  const teacher = await createTeacher(pool);
  const student1 = await createStudent(pool, { courseName, firstName: 'Estudiante Uno' });
  const student2 = await createStudent(pool, { courseName, firstName: 'Estudiante Dos' });
  const room = await createRoom(pool, { teacherId: teacher.id, courseName, subject, status: 'waiting' });
  await createQuestion(pool, {
    subject,
    gradeLevel: '5b',
    options: ['Uno', 'Dos', 'Tres', 'Cuatro'],
    correct: 'Uno',
  });
  return { teacher, student1, student2, room };
}

describe('flujo de juego por sockets', () => {
  it('join -> start -> answer -> stop persiste resultados en la DB de test', async () => {
    const { teacher, student1, student2, room } = await seedSingleQuestionGame({ subject: 'matematica' });

    const teacherSocket = await connectClient();
    const s1 = await connectClient();
    const s2 = await connectClient();

    const teacherToken = signToken({ id: teacher.id, roles: ['teacher'] });
    await teacherJoin(teacherSocket, teacherToken, room.code);
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    await studentJoin(s2, room.code, student2.id, 'Estudiante Dos');

    const startedP = once(teacherSocket, 'game:started');
    const q1P = once(s1, 'game:question');
    const q2P = once(s2, 'game:question');
    teacherSocket.emit('game:start', { roomCode: room.code });
    await startedP;
    await q1P;
    await q2P;

    const revealP = once(teacherSocket, 'game:reveal');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno' }); // correct
    s2.emit('game:answer', { roomCode: room.code, answer: 'Dos' }); // incorrect
    const reveal = await revealP;

    expect(reveal.correctAnswer).toBe('Uno');
    const s1Result = reveal.results.find(r => r.name === 'Estudiante Uno');
    const s2Result = reveal.results.find(r => r.name === 'Estudiante Dos');
    expect(s1Result.correct).toBe(true);
    expect(s2Result.correct).toBe(false);

    const endedP = once(teacherSocket, 'game:end');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    const endData = await endedP;
    expect(endData.summary.totalStudents).toBe(2);

    const { rows: sessions } = await pool.query('SELECT * FROM game_sessions WHERE room_id = $1', [room.id]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].ended_at).not.toBeNull();

    const { rows: answers } = await pool.query(
      'SELECT * FROM student_answers WHERE session_id = $1 ORDER BY student_id',
      [sessions[0].id]
    );
    expect(answers).toHaveLength(2);

    const { rows: ledger } = await pool.query('SELECT * FROM token_ledger WHERE room_id = $1', [room.id]);
    expect(ledger).toHaveLength(1); // only the correct answer earns tokens
    expect(ledger[0].student_id).toBe(student1.id);
    expect(ledger[0].amount).toBeGreaterThan(0);

    const { rows: roomRows } = await pool.query('SELECT status FROM rooms WHERE id = $1', [room.id]);
    expect(roomRows[0].status).toBe('closed');

    const { rows: events } = await pool.query('SELECT event_type FROM events WHERE room_id = $1', [room.id]);
    const eventTypes = events.map(e => e.event_type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'student_joined', 'game_started', 'answer_submitted', 'game_ended',
    ]));

    teacherSocket.disconnect();
    s1.disconnect();
    s2.disconnect();
  });

  it('un alumno desconectado a mitad de juego conserva su estado al reconectar', async () => {
    const { teacher, student1, student2, room } = await seedSingleQuestionGame({ subject: 'lenguaje' });

    const teacherSocket = await connectClient();
    const s1 = await connectClient();
    let s2 = await connectClient();

    const teacherToken = signToken({ id: teacher.id, roles: ['teacher'] });
    await teacherJoin(teacherSocket, teacherToken, room.code);
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    await studentJoin(s2, room.code, student2.id, 'Estudiante Dos');

    const startedP = once(teacherSocket, 'game:started');
    const q1P = once(s1, 'game:question');
    const q2P = once(s2, 'game:question');
    teacherSocket.emit('game:start', { roomCode: room.code });
    await startedP;
    await q1P;
    await q2P;

    // student2 drops mid-question, before answering
    const participantsAfterDrop = once(teacherSocket, 'room:participants');
    s2.disconnect();
    const participants = await participantsAfterDrop;
    expect(participants.participants.some(p => p.name === 'Estudiante Dos')).toBe(false);

    // reconnect with the same identity
    s2 = await connectClient();
    const rejoinedP = once(s2, 'room:joined');
    const catchupP = once(s2, 'game:question');
    s2.emit('student:join', { roomCode: room.code, studentDbId: student2.id, displayName: 'Estudiante Dos' });
    const rejoined = await rejoinedP;
    expect(rejoined.reconnected).toBe(true);
    expect(rejoined.score).toBe(0);
    const catchup = await catchupP;
    expect(catchup.alreadyAnswered).toBe(false);

    const revealP = once(teacherSocket, 'game:reveal');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno' });
    s2.emit('game:answer', { roomCode: room.code, answer: 'Dos' });
    const reveal = await revealP;
    const s2Result = reveal.results.find(r => r.name === 'Estudiante Dos');
    expect(s2Result).toBeDefined();
    expect(s2Result.correct).toBe(false);

    const endedP = once(teacherSocket, 'game:end');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    await endedP;

    const { rows: sessions } = await pool.query('SELECT id FROM game_sessions WHERE room_id = $1', [room.id]);
    const { rows: s2Answers } = await pool.query(
      'SELECT * FROM student_answers WHERE session_id = $1 AND student_id = $2',
      [sessions[0].id, student2.id]
    );
    expect(s2Answers).toHaveLength(1);
    expect(s2Answers[0].answer).toBe('Dos');
    expect(s2Answers[0].is_correct).toBe(false);

    teacherSocket.disconnect();
    s1.disconnect();
    s2.disconnect();
  });
});
