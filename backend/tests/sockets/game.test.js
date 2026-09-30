import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { startTestServer } from '../helpers/socketServer.js';
import { createTeacher, createStudent, createRoom, createQuestion, signToken, studentPayload } from '../helpers/fixtures.js';

const { default: pool } = await import('../../src/db/index.js');
const { getRoomState, QUESTION_TIME_MS } = await import('../../src/sockets/gameSocket.js');
const { issueRoomTicket } = await import('../../src/services/roomTicket.js');

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

// What POST /api/rooms/:code/join hands the student after checking their RUT.
function ticketFor(roomCode, studentDbId, displayName) {
  return issueRoomTicket({ studentId: studentDbId, roomCode, displayName }).ticket;
}

function studentJoin(socket, roomCode, studentDbId, displayName) {
  const joined = once(socket, 'room:joined');
  socket.emit('student:join', { roomCode, ticket: ticketFor(roomCode, studentDbId, displayName) });
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
    s2.emit('student:join', { roomCode: room.code, ticket: ticketFor(room.code, student2.id, 'Estudiante Dos') });
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

  it('descarta con gracia una respuesta con question_index desactualizado, sin romper el juego', async () => {
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
    teacherSocket.emit('game:start', { roomCode: room.code });
    await startedP;
    await q1P;

    // s1 answers with a stale question_index (e.g. a queued offline answer for a question that already passed)
    const rejectedP = once(s1, 'game:answer_rejected');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno', questionIndex: 99 });
    const rejected = await rejectedP;
    expect(rejected.reason).toBe('stale_question_index');
    expect(rejected.currentQuestionIndex).toBe(0);

    // Game keeps working normally afterwards: a valid answer from s1 is still accepted and counted.
    const revealP = once(teacherSocket, 'game:reveal');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno', questionIndex: 0 });
    s2.emit('game:answer', { roomCode: room.code, answer: 'Dos' });
    const reveal = await revealP;
    const s1Result = reveal.results.find(r => r.name === 'Estudiante Uno');
    expect(s1Result.correct).toBe(true);

    const endedP = once(teacherSocket, 'game:end');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    await endedP;

    teacherSocket.disconnect();
    s1.disconnect();
    s2.disconnect();
  });

  it('descarta con gracia una respuesta fuera de la ventana de tiempo de su pregunta, sin romper el juego', async () => {
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
    teacherSocket.emit('game:start', { roomCode: room.code });
    await startedP;
    await q1P;

    // Simulate the question's time window having already elapsed (e.g. answer
    // arrived very late from a client that just came back online).
    const state = getRoomState(room.code);
    state.questionStartedAt = Date.now() - (QUESTION_TIME_MS + 5000);

    const rejectedP = once(s1, 'game:answer_rejected');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno', questionIndex: 0 });
    const rejected = await rejectedP;
    expect(rejected.reason).toBe('time_window_expired');

    // Restore the clock and confirm the game still runs to completion normally
    // (both students answering triggers the immediate reveal, no need to wait for the timer).
    state.questionStartedAt = Date.now();
    const revealP = once(teacherSocket, 'game:reveal');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno', questionIndex: 0 });
    s2.emit('game:answer', { roomCode: room.code, answer: 'Dos', questionIndex: 0 });
    await revealP;

    const endedP = once(teacherSocket, 'game:end');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    await endedP;

    teacherSocket.disconnect();
    s1.disconnect();
    s2.disconnect();
  });
});

describe('control del juego por identidad', () => {
  function emitAndWait(socket, event, payload, responseEvent) {
    const p = once(socket, responseEvent);
    socket.emit(event, payload);
    return p;
  }

  it('abrir el proyector no le quita el control al docente, y el proyector no puede iniciar', async () => {
    const { teacher, student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const projector = await connectClient();
    const s1 = await connectClient();
    await teacherJoin(teacherSocket, token, room.code);
    const projectorJoined = await emitAndWait(projector, 'projector:join', { token, roomCode: room.code }, 'room:joined');
    expect(projectorJoined.role).toBe('projector');
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');

    const projectorError = await emitAndWait(projector, 'game:start', { roomCode: room.code }, 'error');
    expect(projectorError.message).toBe('Solo el docente puede iniciar');

    const projectorStartedP = once(projector, 'game:started');
    const startedP = once(teacherSocket, 'game:started');
    teacherSocket.emit('game:start', { roomCode: room.code });
    await startedP;
    await projectorStartedP;

    let studentGotCount = false;
    s1.on('game:answer_count', () => { studentGotCount = true; });
    const projectorCountP = once(projector, 'game:answer_count');
    const teacherCountP = once(teacherSocket, 'game:answer_count');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno', questionIndex: 0 });
    expect((await projectorCountP).count).toBe(1);
    expect((await teacherCountP).count).toBe(1);
    expect(studentGotCount).toBe(false);

    const endedP = once(teacherSocket, 'game:end');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    await endedP;

    teacherSocket.disconnect();
    projector.disconnect();
    s1.disconnect();
  });

  it('una segunda pestaña o una reconexión del docente no deja sin control a la otra', async () => {
    const { teacher, student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const tabA = await connectClient();
    await teacherJoin(tabA, token, room.code);
    // tabB stands for both a second tab and a reconnected socket: a new id joining later.
    const tabB = await connectClient();
    await teacherJoin(tabB, token, room.code);
    const s1 = await connectClient();
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');

    const startedP = once(tabB, 'game:started');
    tabA.emit('game:start', { roomCode: room.code });
    await startedP;

    const endedP = once(tabA, 'game:end');
    tabB.emit('game:stop', { roomCode: room.code });
    await endedP;

    tabA.disconnect();
    tabB.disconnect();
    s1.disconnect();
  });

  it('rechaza unirse como docente con token de alumno o de otro docente, y admite al admin', async () => {
    const { student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const otherTeacher = await createTeacher(pool);
    const admin = await createTeacher(pool, { roles: ['admin'] });

    const socket = await connectClient();
    const studentToken = signToken(studentPayload(student1));
    const asStudent = await emitAndWait(socket, 'teacher:join', { token: studentToken, roomCode: room.code }, 'error');
    expect(asStudent.message).toBe('No autorizado');

    const asStudentProjector = await emitAndWait(socket, 'projector:join', { token: studentToken, roomCode: room.code }, 'error');
    expect(asStudentProjector.message).toBe('No autorizado');

    const otherToken = signToken({ id: otherTeacher.id, roles: ['teacher'] });
    const asOther = await emitAndWait(socket, 'teacher:join', { token: otherToken, roomCode: room.code }, 'error');
    expect(asOther.message).toBe('No autorizado');

    const s1 = await connectClient();
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    const notJoined = await emitAndWait(socket, 'game:start', { roomCode: room.code }, 'error');
    expect(notJoined.message).toBe('Solo el docente puede iniciar');
    s1.disconnect();

    const adminToken = signToken({ id: admin.id, roles: ['admin'] });
    const asAdmin = await emitAndWait(socket, 'teacher:join', { token: adminToken, roomCode: room.code }, 'room:joined');
    expect(asAdmin.role).toBe('teacher');

    socket.disconnect();
  });
});

describe('identidad del alumno al unirse', () => {
  function emitAndWait(socket, event, payload, responseEvent) {
    const response = once(socket, responseEvent);
    socket.emit(event, payload);
    return response;
  }

  it('ignora un id de alumno enviado por el cliente y exige el ticket del RUT', async () => {
    const { student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const socket = await connectClient();

    const legacy = await emitAndWait(socket, 'student:join', { roomCode: room.code, studentDbId: student1.id, displayName: 'Otro' }, 'error');
    expect(legacy.message).toMatch(/RUT/);

    const sessionToken = signToken(studentPayload(student1));
    const withSessionToken = await emitAndWait(socket, 'student:join', { roomCode: room.code, ticket: sessionToken }, 'error');
    expect(withSessionToken.message).toMatch(/RUT/);

    const otherRoomTicket = ticketFor('ZZZZZZ', student1.id, 'Estudiante Uno');
    const wrongRoom = await emitAndWait(socket, 'student:join', { roomCode: room.code, ticket: otherRoomTicket }, 'error');
    expect(wrongRoom.message).toMatch(/RUT/);

    expect(getRoomState(room.code)?.students.size ?? 0).toBe(0);
    socket.disconnect();
  });

  it('no entrega la sesión a otro que escribe el mismo RUT mientras el dueño juega', async () => {
    const { student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const owner = await connectClient();
    await studentJoin(owner, room.code, student1.id, 'Estudiante Uno');

    const impostor = await connectClient();
    const rejected = await emitAndWait(impostor, 'student:join', { roomCode: room.code, ticket: ticketFor(room.code, student1.id, 'Estudiante Uno') }, 'error');
    expect(rejected.message).toMatch(/ya está jugando/);

    const state = getRoomState(room.code);
    expect(state.students.size).toBe(1);
    expect(state.students.has(owner.id)).toBe(true);

    impostor.disconnect();
    owner.disconnect();
  });

  it('con el mismo ticket, la pestaña nueva se queda con la sesión y la vieja se desconecta', async () => {
    const { student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const ticket = ticketFor(room.code, student1.id, 'Estudiante Uno');

    const tabA = await connectClient();
    await emitAndWait(tabA, 'student:join', { roomCode: room.code, ticket }, 'room:joined');

    const tabB = await connectClient();
    const kicked = once(tabA, 'error');
    const tabADisconnected = once(tabA, 'disconnect');
    const joined = await emitAndWait(tabB, 'student:join', { roomCode: room.code, ticket }, 'room:joined');
    expect(joined.reconnected).toBe(true);
    expect((await kicked).message).toMatch(/otra pestaña/);
    await tabADisconnected;

    const state = getRoomState(room.code);
    expect(state.students.size).toBe(1);
    expect(state.students.get(tabB.id)?.connected).toBe(true);

    tabB.disconnect();
  });
});
