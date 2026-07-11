import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { SOCKET_URL, closeRoom } from '../api/client';

const OPTION_COLORS = ['bg-blue-600', 'bg-orange-500', 'bg-green-600', 'bg-red-600'];

export default function TeacherGame() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [phase, setPhase] = useState('waiting'); // waiting | playing | reveal | ended
  const [participants, setParticipants] = useState([]);
  const [question, setQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerCount, setAnswerCount] = useState({ count: 0, total: 0 });
  const [revealData, setRevealData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [endSummary, setEndSummary] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closingRoom, setClosingRoom] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('academia_token');
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.emit('teacher:join', { token, roomCode: code });

    socket.on('room:joined', (data) => {
      setPhase(data.status === 'waiting' ? 'waiting' : 'playing');
      setParticipants(data.participants || []);
      setRoomId(data.roomId || null);
    });

    socket.on('room:participants', (data) => setParticipants(data.participants));

    socket.on('game:started', () => setPhase('playing'));

    socket.on('game:question', (data) => {
      setQuestion(data);
      setPhase('playing');
      setRevealData(null);
      setAnswerCount({ count: 0, total: participants.length });
      setIsPaused(false);
      setConfirmStop(false);
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

    socket.on('game:answer_count', (data) => {
      setAnswerCount({ count: data.count, total: data.total });
    });

    socket.on('game:reveal', (data) => {
      clearInterval(timerRef.current);
      setRevealData(data);
      setLeaderboard(data.leaderboard);
      setPhase('reveal');
    });

    socket.on('game:end', (data) => {
      clearInterval(timerRef.current);
      setEndSummary(data);
      setLeaderboard(data.leaderboard);
      setPhase('ended');
    });

    socket.on('error', (data) => alert(data.message));

    return () => {
      clearInterval(timerRef.current);
      socket.disconnect();
    };
  }, [code]);

  const startGame = () => socketRef.current?.emit('game:start', { roomCode: code });
  const nextQuestion = () => socketRef.current?.emit('game:next', { roomCode: code });
  const pauseGame = () => socketRef.current?.emit('game:pause', { roomCode: code });
  const resumeGame = () => socketRef.current?.emit('game:resume', { roomCode: code });
  const stopGame = () => { setConfirmStop(false); socketRef.current?.emit('game:stop', { roomCode: code }); };

  const handleCloseRoom = async () => {
    if (!roomId) return;
    setClosingRoom(true);
    try {
      await closeRoom(roomId);
      navigate('/teacher');
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cerrar la sala');
      setClosingRoom(false);
      setConfirmClose(false);
    }
  };

  const projectorUrl = `${window.location.origin}/projector/${code}`;

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <span className="text-gray-400 text-sm">Sala: </span>
          <span className="text-2xl font-black text-gold tracking-widest">{code}</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={projectorUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm bg-surface border border-gray-700 px-3 py-1.5 rounded-lg hover:border-brand transition-colors"
          >
            Abrir proyector ↗
          </a>
          {phase !== 'ended' && (
            confirmClose ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">¿Cerrar sala?</span>
                <button
                  type="button"
                  onClick={handleCloseRoom}
                  disabled={closingRoom}
                  className="text-sm bg-wrong hover:bg-red-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {closingRoom ? 'Cerrando…' : 'Sí, cerrar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  disabled={closingRoom}
                  className="text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClose(true)}
                className="text-sm bg-surface border border-gray-700 text-gray-400 hover:text-wrong hover:border-wrong px-3 py-1.5 rounded-lg transition-colors"
              >
                Cerrar sala
              </button>
            )
          )}
        </div>
      </div>

      {/* Waiting phase */}
      {phase === 'waiting' && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-1">Código de sala</h2>
            <p className="text-5xl font-black text-gold tracking-widest">{code}</p>
            <p className="text-gray-400 text-sm mt-2">
              Los alumnos ingresan en: <span className="text-white">{window.location.origin}/join/{code}</span>
            </p>
          </div>

          <div className="bg-card rounded-2xl p-6">
            <h3 className="font-semibold text-gray-300 mb-3">
              Alumnos conectados ({participants.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {participants.map(p => (
                <span key={p.studentId} className="bg-brand/30 text-brand-light px-3 py-1 rounded-full text-sm font-semibold">
                  {p.name}
                </span>
              ))}
              {participants.length === 0 && (
                <p className="text-gray-500 text-sm">Esperando alumnos…</p>
              )}
            </div>
          </div>

          <button
            onClick={startGame}
            disabled={participants.length === 0}
            className="w-full bg-correct hover:bg-green-700 disabled:opacity-40 text-white font-black py-5 rounded-2xl text-xl transition-colors"
          >
            ¡Iniciar juego! ({participants.length} alumnos)
          </button>
        </div>
      )}

      {/* Playing phase */}
      {(phase === 'playing' || phase === 'reveal') && question && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-400 text-sm">
                Pregunta {question.questionIndex + 1} de {question.totalQuestions}
              </span>
              {phase === 'playing' && (
                <span className={`text-2xl font-black ${timeLeft <= 5 ? 'text-wrong' : 'text-gold'}`}>
                  {timeLeft}s
                </span>
              )}
            </div>
            <p className="text-xl font-bold">{question.text}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {question.options.map((opt, i) => {
              const isCorrect = revealData && opt === revealData.correctAnswer;
              const base = OPTION_COLORS[i];
              return (
                <div
                  key={i}
                  className={`rounded-xl p-4 font-bold text-center text-lg ${
                    revealData
                      ? isCorrect
                        ? 'bg-correct text-white scale-105'
                        : 'bg-gray-800 text-gray-500'
                      : `${base} text-white`
                  } transition-all duration-300`}
                >
                  {opt}
                </div>
              );
            })}
          </div>

          {phase === 'playing' && (
            <div className="bg-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">
                  Respondieron: <span className="text-white font-bold">{answerCount.count}</span>/{answerCount.total}
                </span>
                {isPaused && (
                  <span className="text-yellow-400 font-bold text-sm animate-pulse">⏸ PAUSADO</span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {isPaused ? (
                  <button
                    onClick={resumeGame}
                    className="bg-correct hover:bg-green-700 text-white font-bold px-5 py-2 rounded-xl transition-colors"
                  >
                    ▶ Reanudar
                  </button>
                ) : (
                  <button
                    onClick={pauseGame}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-5 py-2 rounded-xl transition-colors"
                  >
                    ⏸ Pausar
                  </button>
                )}
                <button
                  onClick={nextQuestion}
                  className="bg-brand hover:bg-brand-dark text-white font-bold px-5 py-2 rounded-xl transition-colors"
                >
                  Revelar ahora
                </button>
                <div className="ml-auto flex gap-2">
                  {confirmStop ? (
                    <>
                      <button
                        onClick={stopGame}
                        className="bg-wrong hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl transition-colors"
                      >
                        Sí, terminar
                      </button>
                      <button
                        onClick={() => setConfirmStop(false)}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded-xl transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmStop(true)}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      Detener juego
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === 'reveal' && revealData && (
            <div className="bg-card rounded-2xl p-4">
              <p className="text-sm text-gray-400 mb-1">Pista: <span className="text-gray-200">{question.hint}</span></p>
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Top respuestas</p>
                <div className="flex flex-wrap gap-2">
                  {revealData.results.filter(r => r.correct).slice(0, 5).map(r => (
                    <span key={r.studentId} className="bg-correct/20 text-correct px-2 py-0.5 rounded-full text-sm">
                      {r.name} +{r.tokensEarned}🪙
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard sidebar */}
          {leaderboard.length > 0 && (
            <div className="bg-card rounded-2xl p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Clasificación</p>
              <ol className="space-y-1">
                {leaderboard.slice(0, 5).map(p => (
                  <li key={p.studentId} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="text-gray-500 mr-2">#{p.rank}</span>
                      {p.name}
                    </span>
                    <span className="font-bold text-gold">{p.score}🪙</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* End phase */}
      {phase === 'ended' && endSummary && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl p-6 text-center">
            <p className="text-5xl mb-2">🏆</p>
            <h2 className="text-2xl font-black">¡Actividad finalizada!</h2>
            <p className="text-gray-400 mt-1">
              {endSummary.summary.totalStudents} alumnos · {endSummary.summary.totalQuestions} preguntas
            </p>
          </div>

          <div className="bg-card rounded-2xl p-5">
            <h3 className="font-bold mb-3">Clasificación final</h3>
            <ol className="space-y-2">
              {leaderboard.map(p => (
                <li key={p.studentId} className="flex items-center justify-between">
                  <span>
                    <span className={`font-black mr-2 ${p.rank === 1 ? 'text-gold' : p.rank === 2 ? 'text-gray-300' : p.rank === 3 ? 'text-orange-400' : 'text-gray-500'}`}>
                      #{p.rank}
                    </span>
                    {p.name}
                  </span>
                  <span className="font-bold text-gold">{p.score} tokens</span>
                </li>
              ))}
            </ol>
          </div>

          <button
            onClick={() => navigate('/teacher')}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-4 rounded-xl transition-colors"
          >
            Nueva sala
          </button>
        </div>
      )}
    </div>
  );
}
