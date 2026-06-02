import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../api/client';

const OPTION_COLORS = [
  'bg-blue-600 hover:bg-blue-500 active:bg-blue-700',
  'bg-orange-500 hover:bg-orange-400 active:bg-orange-600',
  'bg-green-600 hover:bg-green-500 active:bg-green-700',
  'bg-red-600 hover:bg-red-500 active:bg-red-700',
];
const OPTION_ICONS = ['▲', '●', '■', '✦'];

export default function StudentGame() {
  const { code } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [phase, setPhase] = useState('waiting'); // waiting | question | answered | reveal | ended
  const [student, setStudent] = useState(null);
  const [question, setQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [myResult, setMyResult] = useState(null);
  const [score, setScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [endSummary, setEndSummary] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('academia_student');
    if (!stored) { navigate(`/join/${code}`); return; }

    const studentData = JSON.parse(stored);
    setStudent(studentData);

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.emit('student:join', {
      roomCode: code,
      studentDbId: studentData.id,
      displayName: studentData.displayName,
    });

    socket.on('room:joined', (data) => {
      if (data.role !== 'student') return;
      if (data.reconnected) {
        setScore(data.score || 0);
        // Phase will be set by game:question event that follows immediately
      } else {
        setPhase('waiting');
      }
    });

    socket.on('game:started', () => setPhase('waiting'));

    socket.on('game:question', (data) => {
      setQuestion(data);
      setPhase(data.alreadyAnswered ? 'answered' : 'question');
      setSelectedAnswer(data.alreadyAnswered ? '?' : null);
      setRevealData(null);
      setMyResult(null);
      setIsPaused(false);
      setTimeLeft(Math.ceil(data.timeMs / 1000));
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on('game:paused', ({ timeRemaining }) => {
      clearInterval(timerRef.current);
      setIsPaused(true);
      setTimeLeft(Math.ceil(timeRemaining / 1000));
    });

    socket.on('game:resumed', ({ timeRemaining }) => {
      setIsPaused(false);
      setTimeLeft(Math.ceil(timeRemaining / 1000));
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on('game:reveal', (data) => {
      clearInterval(timerRef.current);
      setRevealData(data);
      setLeaderboard(data.leaderboard);

      // Find this student's result
      const myName = studentData.displayName;
      const result = data.results.find(r => r.name === myName);
      if (result) {
        setMyResult(result);
        setScore(prev => prev + (result.tokensEarned || 0));
      }
      setPhase('reveal');
    });

    socket.on('game:end', (data) => {
      clearInterval(timerRef.current);
      setEndSummary(data);
      setLeaderboard(data.leaderboard);
      setPhase('ended');
    });

    socket.on('error', (data) => {
      alert(data.message);
      navigate(`/join/${code}`);
    });

    return () => {
      clearInterval(timerRef.current);
      socket.disconnect();
    };
  }, [code]);

  const leaveGame = () => {
    socketRef.current?.disconnect();
    navigate('/join');
  };

  const handleLeave = () => {
    if (phase === 'waiting' || phase === 'ended') { leaveGame(); return; }
    setConfirmLeave(true);
  };

  const submitAnswer = (answer) => {
    if (phase !== 'question' || selectedAnswer) return;
    setSelectedAnswer(answer);
    setPhase('answered');
    socketRef.current?.emit('game:answer', { roomCode: code, answer });
  };

  const myRank = leaderboard.find(p => p.name === student?.displayName)?.rank;

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-gray-400 text-sm">{student?.displayName}</p>
          <p className="text-gold font-black text-xl">{score} tokens</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-gray-500 text-xs">Sala</p>
            <p className="text-gold font-black tracking-widest">{code}</p>
          </div>
          <button
            onClick={handleLeave}
            className="text-gray-600 hover:text-gray-400 text-sm px-2 py-1 rounded-lg transition-colors"
            title="Salir"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Leave confirmation */}
      {confirmLeave && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl">
            <p className="text-2xl">⚠️</p>
            <h3 className="text-lg font-bold">¿Salir del juego?</h3>
            <p className="text-gray-400 text-sm">Perderás las preguntas que faltan y los tokens que podrías ganar.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Quedarme
              </button>
              <button
                onClick={leaveGame}
                className="flex-1 bg-wrong hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting */}
      {phase === 'waiting' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-black">Esperando al docente…</h2>
          <p className="text-gray-400 mt-2">La actividad comenzará pronto</p>
          <div className="mt-6 bg-card rounded-2xl p-4 w-full">
            <p className="text-gray-400 text-sm">Estás en la sala como:</p>
            <p className="text-xl font-bold text-brand-light">{student?.displayName}</p>
          </div>
        </div>
      )}

      {/* Question */}
      {(phase === 'question' || phase === 'answered') && question && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm">
              Pregunta {question.questionIndex + 1}/{question.totalQuestions}
            </span>
            <span className={`text-3xl font-black ${timeLeft <= 5 ? 'text-wrong' : 'text-gold'}`}>
              {timeLeft}s
            </span>
          </div>

          {/* Timer bar */}
          <div className="h-2 bg-gray-800 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-1000"
              style={{ width: `${(timeLeft / (question.timeMs / 1000)) * 100}%` }}
            />
          </div>

          <div className="bg-card rounded-2xl p-5 mb-5 flex-shrink-0">
            <p className="text-2xl font-bold text-center leading-snug">{question.text}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1">
            {question.options.map((opt, i) => {
              const isSelected = selectedAnswer === opt;
              return (
                <button
                  key={i}
                  onClick={() => submitAnswer(opt)}
                  disabled={phase === 'answered'}
                  className={`${OPTION_COLORS[i]} rounded-2xl flex flex-col items-center justify-center gap-2 p-4 font-bold text-xl transition-all active:scale-95 disabled:cursor-default ${
                    phase === 'answered' && !isSelected ? 'opacity-40' : ''
                  } ${isSelected ? 'ring-4 ring-white scale-105' : ''}`}
                >
                  <span className="text-3xl opacity-70">{OPTION_ICONS[i]}</span>
                  <span className="text-center leading-tight">{opt}</span>
                </button>
              );
            })}
          </div>

          {isPaused && (
            <div className="mt-4 bg-yellow-500/20 border border-yellow-500/50 rounded-2xl p-4 text-center">
              <p className="text-yellow-400 font-bold text-lg">⏸ El docente pausó el juego</p>
              <p className="text-yellow-300/70 text-sm mt-1">Espera a que reanude la actividad</p>
            </div>
          )}

          {!isPaused && phase === 'answered' && (
            <div className="mt-4 text-center text-gray-400 animate-pop">
              ✓ Respuesta enviada — esperando al resto…
            </div>
          )}
        </div>
      )}

      {/* Reveal */}
      {phase === 'reveal' && question && revealData && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {myResult ? (
            <div className={`w-full rounded-3xl p-8 text-center ${myResult.correct ? 'bg-correct/20 border-2 border-correct' : 'bg-wrong/20 border-2 border-wrong'}`}>
              <div className="text-6xl mb-2">{myResult.correct ? '✅' : '❌'}</div>
              <h2 className="text-3xl font-black">{myResult.correct ? '¡Correcto!' : '¡Incorrecto!'}</h2>
              {myResult.correct && (
                <p className="text-gold font-black text-2xl mt-1">+{myResult.tokensEarned} tokens</p>
              )}
              {!myResult.correct && (
                <p className="text-gray-300 mt-2">
                  La respuesta era: <span className="font-bold text-correct">{revealData.correctAnswer}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="w-full bg-gray-800 rounded-3xl p-8 text-center">
              <div className="text-6xl mb-2">⏱</div>
              <h2 className="text-2xl font-bold">No respondiste a tiempo</h2>
              <p className="text-gray-400 mt-1">
                La respuesta era: <span className="font-bold text-correct">{revealData.correctAnswer}</span>
              </p>
            </div>
          )}

          <div className="w-full bg-card rounded-2xl p-4">
            <p className="text-gray-400 text-sm text-center">💡 {question.hint}</p>
          </div>

          {myRank && (
            <p className="text-gray-400 text-center">
              Estás en el puesto <span className="font-black text-gold text-xl">#{myRank}</span>
            </p>
          )}

          <p className="text-gray-500 text-sm">La siguiente pregunta comienza pronto…</p>
        </div>
      )}

      {/* End */}
      {phase === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="text-6xl">🏆</div>
          <h2 className="text-3xl font-black">¡Terminó!</h2>
          <div className="bg-card rounded-2xl p-6 w-full">
            <p className="text-gray-400">Tu posición final</p>
            <p className={`text-6xl font-black ${myRank === 1 ? 'text-gold' : 'text-white'}`}>
              #{myRank || '—'}
            </p>
            <p className="text-gold font-bold text-2xl mt-1">{score} tokens ganados</p>
          </div>

          <div className="w-full bg-card rounded-2xl p-4 space-y-2">
            {leaderboard.slice(0, 5).map(p => {
              const isMe = p.name === student?.displayName;
              return (
                <div
                  key={p.studentId}
                  className={`flex justify-between items-center px-2 py-1 rounded-lg ${isMe ? 'bg-brand/20 text-brand-light' : 'text-gray-300'}`}
                >
                  <span><span className="text-gray-500 mr-2">#{p.rank}</span>{p.name}</span>
                  <span className="font-bold text-gold">{p.score}🪙</span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => navigate('/join')}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-4 rounded-xl transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      )}
    </div>
  );
}
