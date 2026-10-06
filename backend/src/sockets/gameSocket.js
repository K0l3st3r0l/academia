const logger = require('../logger');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { trackEvent } = require('../services/eventTracker');
const { verifyRoomTicket, issueProjectorKey, verifyProjectorKey } = require('../services/roomTicket');
const { VALID_SUBJECTS } = require('../routes/questionRoutes');
const { scheduleRating } = require('../services/skillRatings');
const { pickQuestions, LEVEL_TARGETS, DEFAULT_LEVEL } = require('../services/questionPicker');
const { deriveGradeLevel } = require('../services/gradeLevel');

// In-memory game state per room
// Map<roomCode, RoomState>
const rooms = new Map();

const QUESTION_TIME_MS = 25000;
const TOKENS_CORRECT = 10;
const TOKENS_SPEED_BONUS = [5, 3, 1]; // top 3 fastest correct answers
const QUESTION_COUNTS = [5, 10, 15];
const DEFAULT_QUESTION_COUNT = 10;
// A room stays open after a round so the class can play another one; if no
// round starts in this long, it closes on its own.
const ROOM_IDLE_MS = 30 * 60 * 1000;

function getRoomState(code) {
  return rooms.get(code);
}

function getActiveRoomsCount() {
  return rooms.size;
}

function withErrorLogging(socket, eventName, handler) {
  return async (payload, ...rest) => {
    try {
      await handler(payload, ...rest);
    } catch (err) {
      logger.error({
        err,
        stack: err?.stack,
        event: eventName,
        roomCode: payload?.roomCode ?? socket.data?.roomCode,
        actor: socket.data?.userId ?? socket.data?.studentDbId ?? socket.id,
      }, `game socket handler error: ${eventName}`);
    }
  };
}

function buildLeaderboard(students) {
  return [...students.values()]
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({
      rank: i + 1,
      studentId: s.studentId,
      name: s.displayName,
      avatar: s.avatar ?? null,
      score: s.score,
      correct: s.correctCount,
    }));
}

// Teacher-only events (answer counts) go here, so every staff view of the room
// gets them and students never do.
function staffChannel(roomCode) {
  return `${roomCode}:staff`;
}

// Control is tied to who the user is, not to a socket id: the owner's control
// panel, a second tab or a socket.io reconnect all keep working, and a
// projector tab can no longer take control away from the teacher.
async function findOpenRoom(roomCode) {
  const { rows } = await pool.query(
    'SELECT * FROM rooms WHERE code = $1 AND status != $2',
    [roomCode, 'closed']
  );
  return rows[0] || null;
}

async function loadRoomForStaff(token, roomCode) {
  const user = jwt.verify(token, process.env.JWT_SECRET);
  const room = await findOpenRoom(roomCode);
  if (!room) return { error: 'Sala no encontrada' };

  if (room.teacher_id !== user.id && !user.roles?.includes('admin')) return { error: 'No autorizado' };
  return { user, room };
}

// The key from the teacher's projector link wins, so the projector computer
// needs no session; a logged-in staff browser works without it.
async function loadRoomForProjector({ token, projectorKey, roomCode }) {
  let keyRoomCode = null;
  try {
    if (projectorKey) keyRoomCode = verifyProjectorKey(projectorKey).roomCode;
  } catch { /* expired or forged: fall back to the session */ }

  if (keyRoomCode === roomCode) {
    const room = await findOpenRoom(roomCode);
    return room ? { room, userId: null } : { error: 'Sala no encontrada' };
  }

  const { user, room, error } = await loadRoomForStaff(token, roomCode);
  return error ? { error } : { room, userId: user.id };
}

function isRoomController(socket, roomCode) {
  return socket.data?.role === 'teacher' && socket.data.roomCode === roomCode;
}

function ensureRoomState(room) {
  if (!rooms.has(room.code)) {
    rooms.set(room.code, {
      code: room.code,
      roomDbId: room.id,
      subject: room.subject,
      courseName: room.course_name,
      students: new Map(),
      status: 'waiting',
      questions: [],
      currentQuestionIndex: -1,
      questionStartedAt: null,
      timer: null,
      sessionId: null,
      questionAnswers: new Map(),
      paused: false,
      pausedAt: null,
      pausedTimeRemaining: 0,
      usedQuestionIds: new Set(),
      lastReveal: null,
      lastResult: null,
      lastReport: null,
      idleTimer: null,
    });
  }
  return rooms.get(room.code);
}

// Per question and per OA, for the teacher: what the class got wrong and which
// wrong answer it chose. Only counts, never names.
function buildRoundReport(state) {
  const shown = state.questions.slice(0, Math.min(state.currentQuestionIndex + 1, state.questions.length));
  const questions = shown.map((q, index) => {
    const answers = [...(state.questionAnswers.get(index)?.values() ?? [])];
    const wrongCounts = new Map();
    for (const a of answers) {
      if (!a.isCorrect) wrongCounts.set(a.answer, (wrongCounts.get(a.answer) ?? 0) + 1);
    }
    const [topWrong] = [...wrongCounts.entries()].sort((a, b) => b[1] - a[1]);
    return {
      index,
      text: q.text,
      oaCode: q.oaCode,
      oaLabel: q.oaLabel,
      correctAnswer: q.correct,
      answered: answers.length,
      correct: answers.filter(a => a.isCorrect).length,
      // The mistake that usually leads to that answer, when the question was written with one.
      topWrong: topWrong ? { answer: topWrong[0], count: topWrong[1], note: q.optionNotes?.[topWrong[0]] ?? null } : null,
    };
  });
  const oas = new Map();
  for (const q of questions) {
    if (!q.oaCode) continue;
    const oa = oas.get(q.oaCode) ?? { oaCode: q.oaCode, oaLabel: q.oaLabel, answered: 0, correct: 0 };
    oa.answered += q.answered;
    oa.correct += q.correct;
    oas.set(q.oaCode, oa);
  }
  return { questions, oas: [...oas.values()] };
}

// A staff view (teacher tab, projector) opened or reloaded mid-round would
// otherwise stay blank until the next question.
function emitRoundCatchUp(socket, state) {
  if (state.status !== 'playing' || state.currentQuestionIndex < 0) return;

  const qi = state.currentQuestionIndex;
  const q = state.questions[qi];
  const timeRemaining = state.paused
    ? state.pausedTimeRemaining
    : Math.max(0, (state.questionStartedAt + QUESTION_TIME_MS) - Date.now());

  socket.emit('game:question', {
    questionIndex: qi,
    totalQuestions: state.questions.length,
    text: q.text,
    options: q.options,
    timeMs: timeRemaining,
  });

  if (state.lastReveal) {
    socket.emit('game:reveal', state.lastReveal);
    return;
  }
  if (state.paused) socket.emit('game:paused', { timeRemaining: state.pausedTimeRemaining });
  socket.emit('game:answer_count', {
    questionIndex: qi,
    count: state.questionAnswers.get(qi)?.size ?? 0,
    total: connectedStudents(state).length,
  });
}

// Students who left after the last round drop out instead of showing up with
// 0 points; everyone else starts the round from zero.
function resetForNewRound(state) {
  for (const [socketId, student] of state.students) {
    if (student.connected === false) {
      state.students.delete(socketId);
      continue;
    }
    student.score = 0;
    student.correctCount = 0;
    student.tokensEarned = 0;
    student.answers = [];
  }
  state.questionAnswers = new Map();
  state.lastResult = null;
  state.lastReport = null;
}

// avatar: the student's saved character layers (catalog ids), or null without one.
function participantsOf(state) {
  return connectedStudents(state).map(s => ({
    studentId: s.studentId,
    name: s.displayName,
    avatar: s.avatar ?? null,
    score: s.score,
  }));
}

function connectedStudents(state) {
  return [...state.students.values()].filter(s => s.connected !== false);
}

function clearRoomTimer(state) {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

async function persistAnswers(sessionId, answers, questions) {
  for (const [, student] of answers) {
    for (const ans of student.answers) {
      await pool.query(`
        INSERT INTO student_answers (session_id, student_id, question_index, question_id, answer, is_correct, time_taken_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [sessionId, student.studentDbId, ans.questionIndex, questions[ans.questionIndex]?.id ?? null, ans.answer, ans.isCorrect, ans.timeTakenMs]);
    }
  }
}

async function awardTokens(roomId, winners) {
  for (const w of winners) {
    if (!w.studentDbId || w.tokensEarned <= 0) continue;
    await pool.query(
      'UPDATE local_students SET tokens_balance = tokens_balance + $1 WHERE id = $2',
      [w.tokensEarned, w.studentDbId]
    );
    await pool.query(`
      INSERT INTO token_ledger (student_id, amount, reason, room_id)
      VALUES ($1, $2, $3, $4)
    `, [w.studentDbId, w.tokensEarned, 'quiz_battle_correct', roomId]);
  }
}

function setupGameSocket(io) {
  io.on('connection', (socket) => {

    // ── Teacher joins room ──────────────────────────────────────────────
    socket.on('teacher:join', withErrorLogging(socket, 'teacher:join', async ({ token, roomCode }) => {
      try {
        const { user, room, error } = await loadRoomForStaff(token, roomCode);
        if (error) return socket.emit('error', { message: error });

        socket.join(roomCode);
        socket.join(staffChannel(roomCode));
        socket.data = { role: 'teacher', roomCode, userId: user.id, roomDbId: room.id };

        const state = ensureRoomState(room);
        socket.emit('room:joined', {
          role: 'teacher',
          roomCode,
          roomId: room.id,
          subject: state.subject,
          courseName: room.course_name,
          status: state.status,
          participants: participantsOf(state),
          projectorKey: issueProjectorKey(roomCode),
          gradeLevel: deriveGradeLevel(room.course_name),
          lastResult: state.status === 'ended' ? state.lastResult : null,
          lastReport: state.status === 'ended' ? state.lastReport : null,
        });
        emitRoundCatchUp(socket, state);
      } catch (err) {
        socket.emit('error', { message: 'No autorizado' });
      }
    }));

    // ── Projector joins room (observer, cannot control the game) ───────
    socket.on('projector:join', withErrorLogging(socket, 'projector:join', async ({ token, projectorKey, roomCode }) => {
      try {
        const { room, userId, error } = await loadRoomForProjector({ token, projectorKey, roomCode });
        if (error) return socket.emit('error', { message: error });

        socket.join(roomCode);
        socket.join(staffChannel(roomCode));
        socket.data = { role: 'projector', roomCode, userId, roomDbId: room.id };

        const state = ensureRoomState(room);
        socket.emit('room:joined', {
          role: 'projector',
          roomCode,
          status: state.status,
          participants: participantsOf(state),
        });
        emitRoundCatchUp(socket, state);
      } catch (err) {
        socket.emit('error', { message: 'No autorizado' });
      }
    }));

    // ── Student joins room ──────────────────────────────────────────────
    // Identity comes from the ticket issued by POST /api/rooms/:code/join after
    // the student typed their RUT. A student id sent by the client is ignored.
    socket.on('student:join', withErrorLogging(socket, 'student:join', async ({ roomCode, ticket } = {}) => {
      try {
        let identity;
        try {
          identity = verifyRoomTicket(ticket);
        } catch {
          return socket.emit('error', { message: 'Vuelve a ingresar tu RUT para entrar a la sala.' });
        }
        if (identity.roomCode !== roomCode) {
          return socket.emit('error', { message: 'Vuelve a ingresar tu RUT para entrar a la sala.' });
        }
        const { studentId: studentDbId, displayName, ticketId } = identity;

        const { rows: roomRows } = await pool.query(
          'SELECT * FROM rooms WHERE code = $1 AND status != $2',
          [roomCode, 'closed']
        );
        if (!roomRows.length) return socket.emit('error', { message: 'Sala no encontrada o cerrada' });

        // The student may have been withdrawn or moved since the ticket was issued.
        const { rows: stuRows } = await pool.query(
          `SELECT s.id, c.layers AS avatar
           FROM local_students s LEFT JOIN characters c ON c.student_id = s.id
           WHERE s.id = $1 AND s.course_name = $2 AND s.active`,
          [studentDbId, roomRows[0].course_name]
        );
        if (!stuRows.length) return socket.emit('error', { message: 'Alumno no encontrado en este curso' });

        const state = ensureRoomState(roomRows[0]);

        // Check if this student already has a session (reconnect)
        const existing = [...state.students.values()].find(s => s.studentDbId === studentDbId);

        if (state.status !== 'waiting' && state.status !== 'ended' && !existing) {
          // Late join with no prior session — not allowed mid-round; between rounds it is
          return socket.emit('error', { message: 'La actividad ya comenzó. Espera la próxima.' });
        }

        const previousSocket = existing ? io.sockets.sockets.get(existing.socketId) : null;
        const stillConnected = existing && existing.connected !== false && previousSocket?.connected;
        if (stillConnected && existing.ticketId !== ticketId) {
          // Someone else typed this RUT while its owner is playing: don't hand them the session.
          trackEvent({
            actorType: 'student',
            actorId: studentDbId,
            eventType: 'room_join_rejected',
            roomId: state.roomDbId,
            payload: { reason: 'already_connected' },
          });
          return socket.emit('error', { message: 'Ese RUT ya está jugando en esta sala. Si eres tú, avísale a tu profesor.' });
        }

        socket.join(roomCode);
        socket.data = { role: 'student', roomCode, studentDbId, displayName };

        if (existing) {
          // Same ticket from a second tab: the newest tab keeps the session.
          if (stillConnected && previousSocket.id !== socket.id) {
            previousSocket.emit('error', { message: 'Abriste la sala en otra pestaña. Sigue jugando allá.' });
            previousSocket.disconnect(true);
          }

          // Reconnect: migrate existing session to new socket
          state.students.delete(existing.socketId);
          existing.socketId = socket.id;
          existing.ticketId = ticketId;
          existing.connected = true;
          existing.avatar = stuRows[0].avatar; // may have been edited between rounds
          state.students.set(socket.id, existing);

          socket.emit('room:joined', {
            role: 'student',
            roomCode,
            status: state.status,
            displayName,
            reconnected: true,
            score: existing.score,
          });

          // If game is active, send current question state so student can catch up
          if (state.status === 'playing' && state.currentQuestionIndex >= 0) {
            const q = state.questions[state.currentQuestionIndex];
            const alreadyAnswered = existing.answers.some(a => a.questionIndex === state.currentQuestionIndex);
            const timeRemaining = state.paused
              ? state.pausedTimeRemaining
              : Math.max(0, (state.questionStartedAt + QUESTION_TIME_MS) - Date.now());

            socket.emit('game:question', {
              questionIndex: state.currentQuestionIndex,
              totalQuestions: state.questions.length,
              text: q.text,
              options: q.options,
              timeMs: timeRemaining,
              alreadyAnswered,
            });

            if (state.paused) socket.emit('game:paused', { timeRemaining: state.pausedTimeRemaining });
          }
        } else {
          // Fresh join during waiting phase
          state.students.set(socket.id, {
            socketId: socket.id,
            studentId: studentDbId,
            studentDbId,
            ticketId,
            displayName,
            avatar: stuRows[0].avatar,
            score: 0,
            correctCount: 0,
            tokensEarned: 0,
            answers: [],
            connected: true,
          });

          socket.emit('room:joined', {
            role: 'student',
            roomCode,
            status: state.status,
            displayName,
          });
        }

        trackEvent({
          actorType: 'student',
          actorId: studentDbId,
          eventType: 'student_joined',
          roomId: state.roomDbId,
          payload: { displayName, reconnected: !!existing },
        });

        io.to(roomCode).emit('room:participants', { participants: participantsOf(state) });
      } catch (err) {
        logger.error('student:join error', err);
        socket.emit('error', { message: 'Error al unirse a la sala' });
      }
    }));

    // ── Teacher starts the game, or another round once one has ended ────
    socket.on('game:start', withErrorLogging(socket, 'game:start', async ({ roomCode, subject, questionCount, oaCodes = [], level = DEFAULT_LEVEL } = {}) => {
      const state = getRoomState(roomCode);
      if (!state) return socket.emit('error', { message: 'Sala no existe en memoria' });
      if (!isRoomController(socket, roomCode)) return socket.emit('error', { message: 'Solo el docente puede iniciar' });
      if (state.status !== 'waiting' && state.status !== 'ended') return;

      const roundSubject = subject ?? state.subject;
      if (!VALID_SUBJECTS.includes(roundSubject)) {
        return socket.emit('error', { message: 'Esa asignatura no existe.' });
      }
      if (questionCount != null && !QUESTION_COUNTS.includes(questionCount)) {
        return socket.emit('error', { message: 'Elige 5, 10 o 15 preguntas.' });
      }
      const count = questionCount ?? DEFAULT_QUESTION_COUNT;
      if (!Object.hasOwn(LEVEL_TARGETS, level)) {
        return socket.emit('error', { message: 'Elige repaso, ajustado o desafío.' });
      }
      const gradeLevel = deriveGradeLevel(state.courseName);
      if (!Array.isArray(oaCodes) || oaCodes.length > 40 || oaCodes.some(c => !/^OA\d{1,2}$/.test(c))) {
        return socket.emit('error', { message: 'Los OA elegidos no son válidos.' });
      }
      if (oaCodes.length && !gradeLevel) {
        return socket.emit('error', { message: 'Este curso no tiene nivel definido: no se pueden elegir OA.' });
      }

      // Blocks a double click from starting two rounds while the questions load.
      const previousStatus = state.status;
      state.status = 'starting';
      let questions;
      try {
        questions = await pickQuestions({
          subject: roundSubject,
          gradeLevel,
          oaCodes,
          level,
          count,
          usedIds: state.usedQuestionIds,
          studentIds: connectedStudents(state).map(s => s.studentDbId),
        });
      } catch (err) {
        state.status = previousStatus;
        throw err;
      }
      if (getRoomState(roomCode) !== state) return; // closed while loading

      if (!questions.length) {
        state.status = previousStatus;
        return socket.emit('error', {
          message: oaCodes.length
            ? 'No hay preguntas activas para los OA elegidos. Elige otros o agrega preguntas en el banco.'
            : `No hay preguntas activas para "${roundSubject}". Agrega preguntas en el banco de contenido.`,
        });
      }

      if (previousStatus === 'ended') resetForNewRound(state);
      clearTimeout(state.idleTimer);
      state.idleTimer = null;

      state.subject = roundSubject;
      state.questions = questions.map(q => ({
        id: q.id,
        oaCode: q.oa_code,
        oaLabel: q.oa_label,
        text: q.text,
        options: q.options,
        correct: q.correct,
        hint: q.hint || '',
        optionNotes: q.option_notes || null,
      }));
      state.status = 'playing';
      state.currentQuestionIndex = -1;

      // Create game session in DB
      const { rows } = await pool.query(`
        INSERT INTO game_sessions (room_id, game_type, subject, started_at)
        VALUES ($1, 'quiz_battle', $2, NOW())
        RETURNING id
      `, [state.roomDbId, state.subject]);
      state.sessionId = rows[0].id;

      // The room shows the subject of the round being played
      await pool.query("UPDATE rooms SET status = 'active', subject = $2 WHERE id = $1", [state.roomDbId, state.subject]);

      trackEvent({
        actorType: 'teacher',
        actorId: socket.data.userId,
        eventType: 'game_started',
        roomId: state.roomDbId,
        sessionId: state.sessionId,
        payload: { subject: state.subject, totalQuestions: state.questions.length, newRound: previousStatus === 'ended', level, oaCodes },
      });

      io.to(roomCode).emit('game:started', { totalQuestions: state.questions.length, subject: state.subject });
      sendNextQuestion(io, roomCode);
    }));

    // ── Teacher manually advances (skips remaining time) ───────────────
    socket.on('game:next', withErrorLogging(socket, 'game:next', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || !isRoomController(socket, roomCode)) return;
      if (state.status !== 'playing') return;
      clearRoomTimer(state);
      state.paused = false;
      state.pausedAt = null;
      revealAnswer(io, roomCode);
    }));

    // ── Teacher pauses the current question ────────────────────────────
    socket.on('game:pause', withErrorLogging(socket, 'game:pause', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || !isRoomController(socket, roomCode)) return;
      if (state.status !== 'playing' || state.paused) return;

      clearRoomTimer(state);
      state.paused = true;
      state.pausedAt = Date.now();
      state.pausedTimeRemaining = Math.max(0, (state.questionStartedAt + QUESTION_TIME_MS) - Date.now());

      io.to(roomCode).emit('game:paused', { timeRemaining: state.pausedTimeRemaining });
    }));

    // ── Teacher resumes the current question ───────────────────────────
    socket.on('game:resume', withErrorLogging(socket, 'game:resume', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || !isRoomController(socket, roomCode)) return;
      if (state.status !== 'playing' || !state.paused) return;

      // Shift questionStartedAt so timeTakenMs in answers stays accurate
      const pauseDuration = Date.now() - state.pausedAt;
      state.questionStartedAt += pauseDuration;
      state.paused = false;
      state.pausedAt = null;

      io.to(roomCode).emit('game:resumed', { timeRemaining: state.pausedTimeRemaining });

      state.timer = setTimeout(() => revealAnswer(io, roomCode), state.pausedTimeRemaining);
    }));

    // ── Teacher stops the game early ───────────────────────────────────
    socket.on('game:stop', withErrorLogging(socket, 'game:stop', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || !isRoomController(socket, roomCode)) return;
      if (state.status !== 'playing') return;
      clearRoomTimer(state);
      state.paused = false;
      endGame(io, roomCode);
    }));

    // ── Student submits answer ──────────────────────────────────────────
    socket.on('game:answer', withErrorLogging(socket, 'game:answer', ({ roomCode, answer, questionIndex }) => {
      const state = getRoomState(roomCode);
      if (!state || state.status !== 'playing' || state.paused) return;

      const student = state.students.get(socket.id);
      if (!student) return;

      const qi = state.currentQuestionIndex;

      // Answers can arrive late from a queued/offline client for a question
      // that has since moved on, or after that question's own time window
      // already closed. Discard gracefully instead of scoring/crashing.
      if (questionIndex != null && questionIndex !== qi) {
        logger.warn({
          event: 'game:answer', roomCode, actor: student.studentDbId,
          receivedQuestionIndex: questionIndex, currentQuestionIndex: qi,
        }, 'game:answer rechazada: question_index desactualizado');
        return socket.emit('game:answer_rejected', { reason: 'stale_question_index', questionIndex, currentQuestionIndex: qi });
      }

      const elapsedMs = Date.now() - state.questionStartedAt;
      if (elapsedMs > QUESTION_TIME_MS) {
        logger.warn({
          event: 'game:answer', roomCode, actor: student.studentDbId,
          questionIndex: qi, elapsedMs,
        }, 'game:answer rechazada: fuera de la ventana de tiempo de la pregunta');
        return socket.emit('game:answer_rejected', { reason: 'time_window_expired', questionIndex: qi });
      }

      if (!state.questionAnswers.has(qi)) state.questionAnswers.set(qi, new Map());
      const qAnswers = state.questionAnswers.get(qi);

      // Only first answer counts
      if (qAnswers.has(socket.id)) return;

      const timeTakenMs = Date.now() - state.questionStartedAt;
      const question = state.questions[qi];
      const isCorrect = answer === question.correct;

      qAnswers.set(socket.id, { answer, isCorrect, timeTakenMs });
      student.answers.push({ questionIndex: qi, answer, isCorrect, timeTakenMs });

      trackEvent({
        actorType: 'student',
        actorId: student.studentDbId,
        eventType: 'answer_submitted',
        roomId: state.roomDbId,
        sessionId: state.sessionId,
        payload: { question_index: qi, is_correct: isCorrect, time_taken_ms: timeTakenMs },
      });

      // Notify teacher of new answer (count only, not which student answered)
      const totalConnected = connectedStudents(state).length;
      io.to(staffChannel(roomCode)).emit('game:answer_count', {
        questionIndex: qi,
        count: qAnswers.size,
        total: totalConnected,
      });

      // If all connected students answered, reveal immediately
      if (qAnswers.size >= totalConnected) {
        clearRoomTimer(state);
        revealAnswer(io, roomCode);
      }
    }));

    // ── Disconnection ───────────────────────────────────────────────────
    socket.on('disconnect', withErrorLogging(socket, 'disconnect', () => {
      const { role, roomCode } = socket.data || {};
      if (!roomCode) return;

      const state = getRoomState(roomCode);
      if (!state) return;

      if (role === 'student') {
        const student = state.students.get(socket.id);

        // Keep the student's state (score, answers) so a reconnect within the
        // same game can find it via studentDbId and migrate it to the new socket.
        if (student) {
          student.connected = false;

          trackEvent({
            actorType: 'student',
            actorId: student.studentDbId,
            eventType: 'student_disconnected',
            roomId: state.roomDbId,
            sessionId: state.sessionId,
            payload: { displayName: student.displayName },
          });
        }

        io.to(roomCode).emit('room:participants', { participants: participantsOf(state) });
      }
    }));
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────

function sendNextQuestion(io, roomCode) {
  const state = getRoomState(roomCode);
  if (!state) return;

  state.currentQuestionIndex += 1;
  const qi = state.currentQuestionIndex;

  if (qi >= state.questions.length) {
    endGame(io, roomCode);
    return;
  }

  state.paused = false;
  state.pausedAt = null;
  state.pausedTimeRemaining = 0;
  state.lastReveal = null;

  const question = state.questions[qi];
  // Only questions actually shown count as used: a round stopped early leaves the rest for later.
  state.usedQuestionIds.add(question.id);
  state.questionStartedAt = Date.now();
  state.questionAnswers.set(qi, new Map());

  io.to(roomCode).emit('game:question', {
    questionIndex: qi,
    totalQuestions: state.questions.length,
    text: question.text,
    options: question.options,
    timeMs: QUESTION_TIME_MS,
  });

  state.timer = setTimeout(() => revealAnswer(io, roomCode), QUESTION_TIME_MS);
}

function revealAnswer(io, roomCode) {
  const state = getRoomState(roomCode);
  if (!state) return;
  if (state.status !== 'playing') return;

  const qi = state.currentQuestionIndex;
  const question = state.questions[qi];
  const qAnswers = state.questionAnswers.get(qi) || new Map();

  // Score correct answers, give speed bonus to top 3
  const correctEntries = [...qAnswers.entries()]
    .filter(([, a]) => a.isCorrect)
    .sort(([, a], [, b]) => a.timeTakenMs - b.timeTakenMs);

  const results = [];
  for (const [socketId, ans] of qAnswers) {
    const student = state.students.get(socketId);
    if (!student) continue;

    let tokensThisQuestion = 0;
    if (ans.isCorrect) {
      tokensThisQuestion += TOKENS_CORRECT;
      const speedRank = correctEntries.findIndex(([sid]) => sid === socketId);
      if (speedRank >= 0 && speedRank < TOKENS_SPEED_BONUS.length) {
        tokensThisQuestion += TOKENS_SPEED_BONUS[speedRank];
      }
      student.score += tokensThisQuestion;
      student.correctCount += 1;
      student.tokensEarned += tokensThisQuestion;
    }
    results.push({
      studentId: student.studentId,
      name: student.displayName,
      correct: ans.isCorrect,
      timeTakenMs: ans.timeTakenMs,
      tokensEarned: tokensThisQuestion,
    });
  }

  // Students who didn't answer
  for (const [socketId, student] of state.students) {
    if (!qAnswers.has(socketId)) {
      results.push({
        studentId: student.studentId,
        name: student.displayName,
        correct: false,
        timeTakenMs: null,
        tokensEarned: 0,
      });
    }
  }

  state.lastReveal = {
    questionIndex: qi,
    correctAnswer: question.correct,
    hint: question.hint,
    results,
    leaderboard: buildLeaderboard(state.students),
  };
  io.to(roomCode).emit('game:reveal', state.lastReveal);

  // Wait 5 seconds then next question
  state.timer = setTimeout(() => sendNextQuestion(io, roomCode), 5000);
}

// Ends the round. The room stays open for another one unless the teacher is
// closing it (closeRoom), in which case this is the last round.
async function endGame(io, roomCode, { closeRoom = false } = {}) {
  const state = getRoomState(roomCode);
  if (!state) return;

  // 'ended' only once results are saved: a new round can't start mid-save.
  state.status = 'ending';
  clearRoomTimer(state);

  const leaderboard = buildLeaderboard(state.students);

  // Persist to DB
  try {
    if (state.sessionId) {
      await persistAnswers(state.sessionId, state.students, state.questions);
      scheduleRating();

      const summary = {
        totalStudents: state.students.size,
        totalQuestions: state.questions.length,
        leaderboard,
      };
      await pool.query(
        'UPDATE game_sessions SET ended_at = NOW(), summary = $1 WHERE id = $2',
        [JSON.stringify(summary), state.sessionId]
      );

      trackEvent({
        actorType: 'system',
        eventType: 'game_ended',
        roomId: state.roomDbId,
        sessionId: state.sessionId,
        payload: summary,
      });

      // Award tokens
      const winners = [...state.students.values()].map(s => ({
        studentDbId: s.studentDbId,
        tokensEarned: s.tokensEarned,
      }));
      await awardTokens(state.roomDbId, winners);
    }

    await pool.query(
      closeRoom
        ? "UPDATE rooms SET status = 'closed', closed_at = NOW() WHERE id = $1"
        : "UPDATE rooms SET status = 'waiting' WHERE id = $1 AND status != 'closed'",
      [state.roomDbId]
    );
  } catch (err) {
    logger.error('endGame DB error:', err.message);
  }

  state.status = 'ended';
  state.lastResult = {
    leaderboard,
    summary: {
      totalStudents: state.students.size,
      totalQuestions: state.questions.length,
    },
  };
  io.to(roomCode).emit('game:end', state.lastResult);
  state.lastReport = buildRoundReport(state);
  io.to(staffChannel(roomCode)).emit('game:report', state.lastReport);

  if (closeRoom) {
    rooms.delete(roomCode);
    return;
  }
  state.idleTimer = setTimeout(() => closeIdleRoom(io, roomCode), ROOM_IDLE_MS);
}

async function closeIdleRoom(io, roomCode) {
  const state = getRoomState(roomCode);
  if (!state || state.status !== 'ended') return;
  rooms.delete(roomCode);
  try {
    await pool.query(
      "UPDATE rooms SET status = 'closed', closed_at = COALESCE(closed_at, NOW()) WHERE id = $1",
      [state.roomDbId]
    );
    trackEvent({
      actorType: 'system',
      eventType: 'room_closed',
      roomId: state.roomDbId,
      payload: { code: roomCode, reason: 'idle' },
    });
  } catch (err) {
    logger.error({ err, roomCode }, 'closeIdleRoom DB error');
  }
  io.to(roomCode).emit('room:closed', { roomCode });
}

// Called from the REST layer when a teacher closes a room. If there's an
// active game in memory it's ended the same clean way game:stop does
// (persists results, awards tokens, notifies clients via game:end).
// Otherwise drops any lingering lobby state and tells the lobby screens
// (projector, waiting students) via room:closed.
async function closeRoomForTeacher(io, roomCode) {
  const state = getRoomState(roomCode);

  if (state?.status === 'playing') {
    await endGame(io, roomCode, { closeRoom: true });
    return { hadActiveGame: true };
  }

  if (state) {
    clearRoomTimer(state);
    clearTimeout(state.idleTimer);
    rooms.delete(roomCode);
  }
  // Emitted even with no state in memory (e.g. after a backend restart): the
  // projector and students in the lobby would otherwise keep showing the code.
  io?.to(roomCode).emit('room:closed', { roomCode });
  return { hadActiveGame: false };
}

module.exports = {
  setupGameSocket,
  getActiveRoomsCount,
  closeRoomForTeacher,
  closeIdleRoom,
  getRoomState,
  QUESTION_TIME_MS,
};
