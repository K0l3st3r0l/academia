import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { startTestServer } from '../helpers/socketServer.js';
import { createTeacher, createStudent, createRoom, createQuestion, signToken, studentPayload } from '../helpers/fixtures.js';

const { default: pool } = await import('../../src/db/index.js');
const { getRoomState, closeIdleRoom, QUESTION_TIME_MS } = await import('../../src/sockets/gameSocket.js');
const { issueRoomTicket } = await import('../../src/services/roomTicket.js');
const { scheduleRating } = await import('../../src/services/skillRatings.js');

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
    const { rows: [question] } = await pool.query("SELECT id FROM questions WHERE subject = 'matematica'");
    expect(answers.map(a => a.question_id)).toEqual([question.id, question.id]);

    // Ending the round queues the rating pass; waiting on the queue lets it finish.
    await scheduleRating();
    const { rows: [rated] } = await pool.query('SELECT rating_answers FROM questions WHERE id = $1', [question.id]);
    expect(rated.rating_answers).toBe(2);
    const { rows: skills } = await pool.query("SELECT student_id FROM student_skill_ratings WHERE oa_code = '*'");
    expect(skills).toHaveLength(2);

    const { rows: ledger } = await pool.query('SELECT * FROM token_ledger WHERE room_id = $1', [room.id]);
    expect(ledger).toHaveLength(1); // only the correct answer earns tokens
    expect(ledger[0].student_id).toBe(student1.id);
    expect(ledger[0].amount).toBeGreaterThan(0);

    // The room stays open so the class can play another round.
    const { rows: roomRows } = await pool.query('SELECT status FROM rooms WHERE id = $1', [room.id]);
    expect(roomRows[0].status).toBe('waiting');

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

describe('otra ronda en la misma sala', () => {
  function emitAndWait(socket, event, payload, responseEvent) {
    const p = once(socket, responseEvent);
    socket.emit(event, payload);
    return p;
  }

  async function playOneQuestionRound(teacherSocket, roomCode, answers, startPayload = {}) {
    const questionP = once(answers[0][0], 'game:question');
    const startedP = once(teacherSocket, 'game:started');
    teacherSocket.emit('game:start', { roomCode, ...startPayload });
    const started = await startedP;
    await questionP;

    const revealP = once(teacherSocket, 'game:reveal');
    for (const [socket, answer] of answers) socket.emit('game:answer', { roomCode, answer });
    await revealP;

    const endP = once(teacherSocket, 'game:end');
    teacherSocket.emit('game:stop', { roomCode });
    return { started, end: await endP };
  }

  it('juega una segunda ronda con otra asignatura, con puntaje y tokens desde cero', async () => {
    const { teacher, student1, student2, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    await createQuestion(pool, { subject: 'lenguaje', gradeLevel: '5b', options: ['A', 'B', 'C', 'D'], correct: 'B' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const projector = await connectClient();
    const s1 = await connectClient();
    const s2 = await connectClient();
    const { projectorKey } = await teacherJoin(teacherSocket, token, room.code);
    await emitAndWait(projector, 'projector:join', { token: '', projectorKey, roomCode: room.code }, 'room:joined');
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    await studentJoin(s2, room.code, student2.id, 'Estudiante Dos');

    await playOneQuestionRound(teacherSocket, room.code, [[s1, 'Uno'], [s2, 'Dos']]);
    expect(getRoomState(room.code).idleTimer).toBeTruthy();

    const projectorQuestionP = once(projector, 'game:question');
    const { started, end } = await playOneQuestionRound(
      teacherSocket, room.code, [[s1, 'A'], [s2, 'B']], { subject: 'lenguaje', questionCount: 5 }
    );
    expect(started.subject).toBe('lenguaje');
    expect((await projectorQuestionP).options).toEqual(['A', 'B', 'C', 'D']);
    expect(getRoomState(room.code).idleTimer).toBeTruthy();

    const scores = Object.fromEntries(end.leaderboard.map(p => [p.name, p.score]));
    expect(scores['Estudiante Uno']).toBe(0);
    expect(scores['Estudiante Dos']).toBeGreaterThan(0);

    const { rows: sessions } = await pool.query('SELECT subject FROM game_sessions WHERE room_id = $1 ORDER BY started_at', [room.id]);
    expect(sessions.map(s => s.subject)).toEqual(['matematica', 'lenguaje']);

    const { rows: ledger } = await pool.query('SELECT student_id FROM token_ledger WHERE room_id = $1 ORDER BY created_at', [room.id]);
    expect(ledger.map(l => l.student_id)).toEqual([student1.id, student2.id]);

    const { rows: roomRows } = await pool.query('SELECT status, subject FROM rooms WHERE id = $1', [room.id]);
    expect(roomRows[0]).toMatchObject({ status: 'waiting', subject: 'lenguaje' });

    // A teacher tab reloaded between rounds gets the last results back.
    const reloaded = await connectClient();
    const rejoined = await teacherJoin(reloaded, token, room.code);
    expect(rejoined.status).toBe('ended');
    expect(rejoined.subject).toBe('lenguaje');
    expect(rejoined.lastResult.leaderboard).toHaveLength(2);

    for (const socket of [teacherSocket, projector, s1, s2, reloaded]) socket.disconnect();
  });

  it('entre rondas entra un alumno nuevo y el que se fue no aparece en la siguiente', async () => {
    const { teacher, student1, student2, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const student3 = await createStudent(pool, { courseName: room.course_name, firstName: 'Estudiante Tres' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const s1 = await connectClient();
    const s2 = await connectClient();
    await teacherJoin(teacherSocket, token, room.code);
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    await studentJoin(s2, room.code, student2.id, 'Estudiante Dos');
    await playOneQuestionRound(teacherSocket, room.code, [[s1, 'Uno'], [s2, 'Uno']]);

    const leftP = once(teacherSocket, 'room:participants');
    s2.disconnect();
    await leftP;

    const s3 = await connectClient();
    const joined = await studentJoin(s3, room.code, student3.id, 'Estudiante Tres');
    expect(joined.status).toBe('ended');

    const { end } = await playOneQuestionRound(teacherSocket, room.code, [[s1, 'Uno'], [s3, 'Uno']]);
    expect(end.leaderboard.map(p => p.name).sort()).toEqual(['Estudiante Tres', 'Estudiante Uno']);
    expect(end.summary.totalStudents).toBe(2);

    for (const socket of [teacherSocket, s1, s3]) socket.disconnect();
  });

  it('no repite preguntas de la ronda anterior mientras queden otras', async () => {
    const { teacher, student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    for (let i = 2; i <= 6; i++) {
      await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', text: `Pregunta ${i}`, options: ['Uno', 'Dos', 'Tres', 'Cuatro'], correct: 'Uno' });
    }
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const s1 = await connectClient();
    await teacherJoin(teacherSocket, token, room.code);
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');

    await playOneQuestionRound(teacherSocket, room.code, [[s1, 'Uno']], { questionCount: 5 });
    const firstRound = getRoomState(room.code).questions.map(q => q.text);
    expect(firstRound).toHaveLength(5);

    await playOneQuestionRound(teacherSocket, room.code, [[s1, 'Uno']], { questionCount: 5 });
    // Round one was stopped after its first question: only that one counts as seen.
    const secondRound = getRoomState(room.code).questions.map(q => q.text);
    expect(secondRound).toHaveLength(5);
    expect(secondRound).not.toContain(firstRound[0]);

    teacherSocket.disconnect();
    s1.disconnect();
  });

  it('rechaza una asignatura o una cantidad de preguntas inválida sin iniciar', async () => {
    const { teacher, student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const s1 = await connectClient();
    await teacherJoin(teacherSocket, token, room.code);
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');

    const badSubject = await emitAndWait(teacherSocket, 'game:start', { roomCode: room.code, subject: 'quimica' }, 'error');
    expect(badSubject.message).toBe('Esa asignatura no existe.');
    const badCount = await emitAndWait(teacherSocket, 'game:start', { roomCode: room.code, questionCount: 1000 }, 'error');
    expect(badCount.message).toBe('Elige 5, 10 o 15 preguntas.');
    const noQuestions = await emitAndWait(teacherSocket, 'game:start', { roomCode: room.code, subject: 'historia' }, 'error');
    expect(noQuestions.message).toMatch(/No hay preguntas activas/);
    expect(getRoomState(room.code).status).toBe('waiting');

    teacherSocket.disconnect();
    s1.disconnect();
  });

  it('una sala sin otra ronda se cierra sola y avisa a quienes siguen conectados', async () => {
    const { teacher, student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const s1 = await connectClient();
    await teacherJoin(teacherSocket, token, room.code);
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    await playOneQuestionRound(teacherSocket, room.code, [[s1, 'Uno']]);

    const closedP = once(s1, 'room:closed');
    await closeIdleRoom(testServer.io, room.code);
    await closedP;
    expect(getRoomState(room.code)).toBeUndefined();

    const { rows } = await pool.query('SELECT status, closed_at FROM rooms WHERE id = $1', [room.id]);
    expect(rows[0].status).toBe('closed');
    expect(rows[0].closed_at).not.toBeNull();

    teacherSocket.disconnect();
    s1.disconnect();
  });
});

describe('vista del docente o proyector abierta a mitad de ronda', () => {
  // Listeners go up before the join: the catch-up events follow room:joined right away.
  function joinAndCollect(socket, event, payload, events) {
    const got = {};
    const all = events.map(e => once(socket, e).then(data => { got[e] = data; }));
    socket.emit(event, payload);
    return Promise.all(all).then(() => got);
  }

  it('recibe la pregunta en curso con el tiempo que queda y cuántos respondieron', async () => {
    const { teacher, student1, student2, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const { projectorKey } = await teacherJoin(teacherSocket, token, room.code);
    const s1 = await connectClient();
    const s2 = await connectClient();
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    await studentJoin(s2, room.code, student2.id, 'Estudiante Dos');

    const questionP = once(s1, 'game:question');
    teacherSocket.emit('game:start', { roomCode: room.code });
    await questionP;
    const countP = once(teacherSocket, 'game:answer_count');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno' });
    await countP;

    const reloadedTab = await connectClient();
    const tab = await joinAndCollect(reloadedTab, 'teacher:join', { token, roomCode: room.code },
      ['room:joined', 'game:question', 'game:answer_count']);
    expect(tab['room:joined'].status).toBe('playing');
    expect(tab['game:question'].options).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro']);
    expect(tab['game:question'].timeMs).toBeGreaterThan(0);
    expect(tab['game:question'].timeMs).toBeLessThanOrEqual(QUESTION_TIME_MS);
    expect(tab['game:answer_count']).toMatchObject({ count: 1, total: 2 });

    const projector = await connectClient();
    const proj = await joinAndCollect(projector, 'projector:join', { token: '', projectorKey, roomCode: room.code },
      ['room:joined', 'game:question', 'game:answer_count']);
    expect(proj['game:question'].questionIndex).toBe(0);
    expect(proj['game:answer_count'].count).toBe(1);

    for (const socket of [teacherSocket, reloadedTab, projector, s1, s2]) socket.disconnect();
  });

  it('si la respuesta ya se reveló, recibe también el reveal', async () => {
    const { teacher, student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    await teacherJoin(teacherSocket, token, room.code);
    const s1 = await connectClient();
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');

    const questionP = once(s1, 'game:question');
    teacherSocket.emit('game:start', { roomCode: room.code });
    await questionP;
    const revealP = once(teacherSocket, 'game:reveal');
    s1.emit('game:answer', { roomCode: room.code, answer: 'Uno' });
    await revealP;

    const reloadedTab = await connectClient();
    const tab = await joinAndCollect(reloadedTab, 'teacher:join', { token, roomCode: room.code },
      ['room:joined', 'game:question', 'game:reveal']);
    expect(tab['game:reveal'].correctAnswer).toBe('Uno');
    expect(tab['game:reveal'].leaderboard[0].name).toBe('Estudiante Uno');

    const endP = once(teacherSocket, 'game:end');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    await endP;
    for (const socket of [teacherSocket, reloadedTab, s1]) socket.disconnect();
  });
});

describe('ronda por OA con informe para el profesor', () => {
  function emitAndWait(socket, event, payload, responseEvent) {
    const p = once(socket, responseEvent);
    socket.emit(event, payload);
    return p;
  }

  async function seedOaQuestions() {
    const { teacher, student1, student2, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    await pool.query("UPDATE questions SET oa_code = 'OA1' WHERE subject = 'matematica'");
    await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', options: ['10', '100', '1', '1000'], correct: '10', oaCode: 'OA20', text: 'mm en 1 cm' });
    return { teacher, student1, student2, room };
  }

  it('solo usa preguntas de los OA elegidos y manda el informe al profesor y al proyector, no a los alumnos', async () => {
    const { teacher, student1, student2, room } = await seedOaQuestions();
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const { projectorKey, gradeLevel } = await teacherJoin(teacherSocket, token, room.code);
    expect(gradeLevel).toBe('5b');
    const projector = await connectClient();
    await emitAndWait(projector, 'projector:join', { token: '', projectorKey, roomCode: room.code }, 'room:joined');
    const s1 = await connectClient();
    const s2 = await connectClient();
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    await studentJoin(s2, room.code, student2.id, 'Estudiante Dos');

    let studentGotReport = false;
    s1.on('game:report', () => { studentGotReport = true; });
    const questionP = once(s1, 'game:question');
    teacherSocket.emit('game:start', { roomCode: room.code, oaCodes: ['OA20'], level: 'desafio', questionCount: 5 });
    const question = await questionP;
    expect(question.text).toBe('mm en 1 cm');
    expect(question.totalQuestions).toBe(1);

    const revealP = once(teacherSocket, 'game:reveal');
    s1.emit('game:answer', { roomCode: room.code, answer: '100' });
    s2.emit('game:answer', { roomCode: room.code, answer: '10' });
    await revealP;

    const teacherReportP = once(teacherSocket, 'game:report');
    const projectorReportP = once(projector, 'game:report');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    const report = await teacherReportP;
    await projectorReportP;
    expect(report.questions[0]).toMatchObject({ oaCode: 'OA20', answered: 2, correct: 1, correctAnswer: '10', topWrong: { answer: '100', count: 1 } });
    expect(report.oas).toEqual([expect.objectContaining({ oaCode: 'OA20', answered: 2, correct: 1 })]);
    expect(studentGotReport).toBe(false);

    const reloaded = await connectClient();
    const rejoined = await teacherJoin(reloaded, token, room.code);
    expect(rejoined.lastReport.questions).toHaveLength(1);

    for (const socket of [teacherSocket, projector, s1, s2, reloaded]) socket.disconnect();
  });

  it('rechaza OA inválidos, una exigencia desconocida y OA sin preguntas', async () => {
    const { teacher, student1, room } = await seedOaQuestions();
    const token = signToken({ id: teacher.id, roles: ['teacher'] });
    const teacherSocket = await connectClient();
    await teacherJoin(teacherSocket, token, room.code);
    const s1 = await connectClient();
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');

    const badOa = await emitAndWait(teacherSocket, 'game:start', { roomCode: room.code, oaCodes: ['DROP TABLE'] }, 'error');
    expect(badOa.message).toBe('Los OA elegidos no son válidos.');
    const badLevel = await emitAndWait(teacherSocket, 'game:start', { roomCode: room.code, level: 'imposible' }, 'error');
    expect(badLevel.message).toBe('Elige repaso, ajustado o desafío.');
    const empty = await emitAndWait(teacherSocket, 'game:start', { roomCode: room.code, oaCodes: ['OA27'] }, 'error');
    expect(empty.message).toMatch(/No hay preguntas activas para los OA elegidos/);
    expect(getRoomState(room.code).status).toBe('waiting');

    teacherSocket.disconnect();
    s1.disconnect();
  });
});

describe('proyector en un computador sin sesión', () => {
  function emitAndWait(socket, event, payload, responseEvent) {
    const p = once(socket, responseEvent);
    socket.emit(event, payload);
    return p;
  }

  it('la llave del enlace del docente basta para mirar la sala, pero no para controlarla', async () => {
    const { teacher, student1, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const { projectorKey } = await teacherJoin(teacherSocket, token, room.code);
    expect(projectorKey).toBeTruthy();

    const projector = await connectClient();
    const joined = await emitAndWait(projector, 'projector:join', { token: '', projectorKey, roomCode: room.code }, 'room:joined');
    expect(joined.role).toBe('projector');
    expect(joined.projectorKey).toBeUndefined();

    const s1 = await connectClient();
    const participantsP = once(projector, 'room:participants');
    await studentJoin(s1, room.code, student1.id, 'Estudiante Uno');
    expect((await participantsP).participants.map(p => p.name)).toContain('Estudiante Uno');

    const refused = await emitAndWait(projector, 'game:start', { roomCode: room.code }, 'error');
    expect(refused.message).toBe('Solo el docente puede iniciar');

    const projectorQuestionP = once(projector, 'game:question');
    teacherSocket.emit('game:start', { roomCode: room.code });
    expect((await projectorQuestionP).options).toHaveLength(4);

    const endedP = once(projector, 'game:end');
    teacherSocket.emit('game:stop', { roomCode: room.code });
    await endedP;

    teacherSocket.disconnect();
    projector.disconnect();
    s1.disconnect();
  });

  it('rechaza sin sesión ni llave, con la llave de otra sala o con una llave falsa', async () => {
    const { teacher, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const otherRoom = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: 'matematica', status: 'waiting' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const { projectorKey: otherKey } = await teacherJoin(teacherSocket, token, otherRoom.code);

    const socket = await connectClient();
    const noKey = await emitAndWait(socket, 'projector:join', { token: '', roomCode: room.code }, 'error');
    expect(noKey.message).toBe('No autorizado');

    const wrongRoom = await emitAndWait(socket, 'projector:join', { token: '', projectorKey: otherKey, roomCode: room.code }, 'error');
    expect(wrongRoom.message).toBe('No autorizado');

    const forged = await emitAndWait(socket, 'projector:join', { token: '', projectorKey: token, roomCode: room.code }, 'error');
    expect(forged.message).toBe('No autorizado');

    teacherSocket.disconnect();
    socket.disconnect();
  });

  it('la llave no sirve como sesión de docente ni como ticket de alumno, y muere al cerrar la sala', async () => {
    const { teacher, room } = await seedSingleQuestionGame({ subject: 'matematica' });
    const token = signToken({ id: teacher.id, roles: ['teacher'] });

    const teacherSocket = await connectClient();
    const { projectorKey } = await teacherJoin(teacherSocket, token, room.code);

    const socket = await connectClient();
    const asTeacher = await emitAndWait(socket, 'teacher:join', { token: projectorKey, roomCode: room.code }, 'error');
    expect(asTeacher.message).toBe('No autorizado');

    const asStudent = await emitAndWait(socket, 'student:join', { roomCode: room.code, ticket: projectorKey }, 'error');
    expect(asStudent.message).toBe('Vuelve a ingresar tu RUT para entrar a la sala.');

    await pool.query("UPDATE rooms SET status = 'closed' WHERE id = $1", [room.id]);
    const closed = await emitAndWait(socket, 'projector:join', { token: '', projectorKey, roomCode: room.code }, 'error');
    expect(closed.message).toBe('Sala no encontrada');

    teacherSocket.disconnect();
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
