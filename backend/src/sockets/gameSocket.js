const logger = require('../logger');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// In-memory game state per room
// Map<roomCode, RoomState>
const rooms = new Map();

const QUESTION_TIME_MS = 25000;
const TOKENS_CORRECT = 10;
const TOKENS_SPEED_BONUS = [5, 3, 1]; // top 3 fastest correct answers

function getRoomState(code) {
  return rooms.get(code);
}

function deriveGradeLevel(courseName) {
  if (!courseName) return null;
  const match = courseName.match(/(\d+)\s*°/);
  if (!match) return null;
  const grade = parseInt(match[1], 10);
  if (grade < 1 || grade > 8) return null;
  return `${grade}b`;
}

function buildLeaderboard(students) {
  return [...students.values()]
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({
      rank: i + 1,
      studentId: s.studentId,
      name: s.displayName,
      score: s.score,
      correct: s.correctCount,
    }));
}

function clearRoomTimer(state) {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

async function persistAnswers(sessionId, answers) {
  for (const [, student] of answers) {
    for (const ans of student.answers) {
      await pool.query(`
        INSERT INTO student_answers (session_id, student_id, question_index, answer, is_correct, time_taken_ms)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [sessionId, student.studentDbId, ans.questionIndex, ans.answer, ans.isCorrect, ans.timeTakenMs]);
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
    socket.on('teacher:join', async ({ token, roomCode }) => {
      try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        const { rows } = await pool.query(
          'SELECT * FROM rooms WHERE code = $1 AND status != $2',
          [roomCode, 'closed']
        );
        if (!rows.length) return socket.emit('error', { message: 'Sala no encontrada' });

        const room = rows[0];
        socket.join(roomCode);
        socket.data = { role: 'teacher', roomCode, userId: user.id, roomDbId: room.id };

        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, {
            code: roomCode,
            roomDbId: room.id,
            subject: room.subject,
            courseName: room.course_name,
            teacherSocketId: socket.id,
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
          });
        } else {
          rooms.get(roomCode).teacherSocketId = socket.id;
        }

        const state = rooms.get(roomCode);
        socket.emit('room:joined', {
          role: 'teacher',
          roomCode,
          subject: room.subject,
          courseName: room.course_name,
          status: state.status,
          participants: [...state.students.values()].map(s => ({
            studentId: s.studentId,
            name: s.displayName,
            score: s.score,
          })),
        });
      } catch (err) {
        socket.emit('error', { message: 'No autorizado' });
      }
    });

    // ── Student joins room ──────────────────────────────────────────────
    socket.on('student:join', async ({ roomCode, studentDbId, displayName }) => {
      try {
        const { rows: roomRows } = await pool.query(
          'SELECT * FROM rooms WHERE code = $1 AND status != $2',
          [roomCode, 'closed']
        );
        if (!roomRows.length) return socket.emit('error', { message: 'Sala no encontrada o cerrada' });

        // Verify student exists in local DB for this room's course
        const { rows: stuRows } = await pool.query(
          'SELECT * FROM local_students WHERE id = $1 AND course_name = $2',
          [studentDbId, roomRows[0].course_name]
        );
        if (!stuRows.length) return socket.emit('error', { message: 'Alumno no encontrado en este curso' });

        socket.join(roomCode);
        socket.data = { role: 'student', roomCode, studentDbId, displayName };

        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, {
            code: roomCode,
            roomDbId: roomRows[0].id,
            subject: roomRows[0].subject,
            courseName: roomRows[0].course_name,
            teacherSocketId: null,
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
          });
        }

        const state = rooms.get(roomCode);

        // Check if this student already has a session (reconnect)
        const existing = [...state.students.values()].find(s => s.studentDbId === studentDbId);

        if (state.status !== 'waiting' && !existing) {
          // Late join with no prior session — not allowed
          return socket.emit('error', { message: 'La actividad ya comenzó. Espera la próxima.' });
        }

        if (existing) {
          // Reconnect: migrate existing session to new socket
          state.students.delete(existing.socketId);
          existing.socketId = socket.id;
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
            displayName,
            score: 0,
            correctCount: 0,
            tokensEarned: 0,
            answers: [],
          });

          socket.emit('room:joined', {
            role: 'student',
            roomCode,
            status: state.status,
            displayName,
          });
        }

        io.to(roomCode).emit('room:participants', {
          participants: [...state.students.values()].map(s => ({
            studentId: s.studentId,
            name: s.displayName,
            score: s.score,
          })),
        });
      } catch (err) {
        logger.error('student:join error', err);
        socket.emit('error', { message: 'Error al unirse a la sala' });
      }
    });

    // ── Teacher starts the game ─────────────────────────────────────────
    socket.on('game:start', async ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state) return socket.emit('error', { message: 'Sala no existe en memoria' });
      if (socket.id !== state.teacherSocketId) return socket.emit('error', { message: 'Solo el docente puede iniciar' });
      if (state.status !== 'waiting') return;

      // Load up to 10 random active questions for this subject, matched to the room's grade level.
      // Falls back to grade_level='general' questions to always fill up to 10 when possible.
      const gradeLevel = deriveGradeLevel(state.courseName);
      let questions = [];

      if (gradeLevel) {
        const { rows } = await pool.query(
          `SELECT * FROM questions WHERE subject = $1 AND grade_level = $2 AND active = true ORDER BY RANDOM() LIMIT 10`,
          [state.subject, gradeLevel]
        );
        questions = rows;
      }

      if (questions.length < 10) {
        const { rows: fallback } = await pool.query(
          `SELECT * FROM questions
           WHERE subject = $1 AND grade_level = 'general' AND active = true AND id != ALL($2::uuid[])
           ORDER BY RANDOM() LIMIT $3`,
          [state.subject, questions.map(q => q.id), 10 - questions.length]
        );
        questions = questions.concat(fallback);
      }

      if (!questions.length) {
        return socket.emit('error', { message: `No hay preguntas activas para "${state.subject}". Agrega preguntas en el banco de contenido.` });
      }

      state.questions = questions.map(q => ({
        text: q.text,
        options: q.options,
        correct: q.correct,
        hint: q.hint || '',
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

      // Update room status
      await pool.query("UPDATE rooms SET status = 'active' WHERE id = $1", [state.roomDbId]);

      io.to(roomCode).emit('game:started', { totalQuestions: state.questions.length });
      sendNextQuestion(io, roomCode);
    });

    // ── Teacher manually advances (skips remaining time) ───────────────
    socket.on('game:next', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || socket.id !== state.teacherSocketId) return;
      if (state.status !== 'playing') return;
      clearRoomTimer(state);
      state.paused = false;
      state.pausedAt = null;
      revealAnswer(io, roomCode);
    });

    // ── Teacher pauses the current question ────────────────────────────
    socket.on('game:pause', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || socket.id !== state.teacherSocketId) return;
      if (state.status !== 'playing' || state.paused) return;

      clearRoomTimer(state);
      state.paused = true;
      state.pausedAt = Date.now();
      state.pausedTimeRemaining = Math.max(0, (state.questionStartedAt + QUESTION_TIME_MS) - Date.now());

      io.to(roomCode).emit('game:paused', { timeRemaining: state.pausedTimeRemaining });
    });

    // ── Teacher resumes the current question ───────────────────────────
    socket.on('game:resume', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || socket.id !== state.teacherSocketId) return;
      if (state.status !== 'playing' || !state.paused) return;

      // Shift questionStartedAt so timeTakenMs in answers stays accurate
      const pauseDuration = Date.now() - state.pausedAt;
      state.questionStartedAt += pauseDuration;
      state.paused = false;
      state.pausedAt = null;

      io.to(roomCode).emit('game:resumed', { timeRemaining: state.pausedTimeRemaining });

      state.timer = setTimeout(() => revealAnswer(io, roomCode), state.pausedTimeRemaining);
    });

    // ── Teacher stops the game early ───────────────────────────────────
    socket.on('game:stop', ({ roomCode }) => {
      const state = getRoomState(roomCode);
      if (!state || socket.id !== state.teacherSocketId) return;
      if (state.status !== 'playing') return;
      clearRoomTimer(state);
      state.paused = false;
      endGame(io, roomCode);
    });

    // ── Student submits answer ──────────────────────────────────────────
    socket.on('game:answer', ({ roomCode, answer }) => {
      const state = getRoomState(roomCode);
      if (!state || state.status !== 'playing' || state.paused) return;

      const student = state.students.get(socket.id);
      if (!student) return;

      const qi = state.currentQuestionIndex;
      if (!state.questionAnswers.has(qi)) state.questionAnswers.set(qi, new Map());
      const qAnswers = state.questionAnswers.get(qi);

      // Only first answer counts
      if (qAnswers.has(socket.id)) return;

      const timeTakenMs = Date.now() - state.questionStartedAt;
      const question = state.questions[qi];
      const isCorrect = answer === question.correct;

      qAnswers.set(socket.id, { answer, isCorrect, timeTakenMs });
      student.answers.push({ questionIndex: qi, answer, isCorrect, timeTakenMs });

      // Notify teacher of new answer (count only, not which student answered)
      io.to(state.teacherSocketId).emit('game:answer_count', {
        questionIndex: qi,
        count: qAnswers.size,
        total: state.students.size,
      });

      // If all students answered, reveal immediately
      if (qAnswers.size >= state.students.size) {
        clearRoomTimer(state);
        revealAnswer(io, roomCode);
      }
    });

    // ── Disconnection ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const { role, roomCode } = socket.data || {};
      if (!roomCode) return;

      const state = getRoomState(roomCode);
      if (!state) return;

      if (role === 'student') {
        state.students.delete(socket.id);
        io.to(roomCode).emit('room:participants', {
          participants: [...state.students.values()].map(s => ({
            studentId: s.studentId,
            name: s.displayName,
            score: s.score,
          })),
        });
      }
    });
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

  const question = state.questions[qi];
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

  io.to(roomCode).emit('game:reveal', {
    questionIndex: qi,
    correctAnswer: question.correct,
    hint: question.hint,
    results,
    leaderboard: buildLeaderboard(state.students),
  });

  // Wait 5 seconds then next question
  state.timer = setTimeout(() => sendNextQuestion(io, roomCode), 5000);
}

async function endGame(io, roomCode) {
  const state = getRoomState(roomCode);
  if (!state) return;

  state.status = 'ended';
  clearRoomTimer(state);

  const leaderboard = buildLeaderboard(state.students);

  // Persist to DB
  try {
    if (state.sessionId) {
      await persistAnswers(state.sessionId, state.students);

      const summary = {
        totalStudents: state.students.size,
        totalQuestions: state.questions.length,
        leaderboard,
      };
      await pool.query(
        'UPDATE game_sessions SET ended_at = NOW(), summary = $1 WHERE id = $2',
        [JSON.stringify(summary), state.sessionId]
      );

      // Award tokens
      const winners = [...state.students.values()].map(s => ({
        studentDbId: s.studentDbId,
        tokensEarned: s.tokensEarned,
      }));
      await awardTokens(state.roomDbId, winners);
    }

    await pool.query("UPDATE rooms SET status = 'closed', closed_at = NOW() WHERE id = $1", [state.roomDbId]);
  } catch (err) {
    logger.error('endGame DB error:', err.message);
  }

  io.to(roomCode).emit('game:end', {
    leaderboard,
    summary: {
      totalStudents: state.students.size,
      totalQuestions: state.questions.length,
    },
  });

  // Clean up memory after 10 minutes
  setTimeout(() => rooms.delete(roomCode), 10 * 60 * 1000);
}

module.exports = { setupGameSocket };
