import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getRoom } from '../api/client';
import { SOCKET_URL } from '../api/client';
import { subjectLabel } from '../utils/subjects';
import StudentAvatar from '../components/character/StudentAvatar';
import { Tokens } from '../components/TokenCoin';

const OPTION_COLORS = ['bg-blue-600', 'bg-orange-500', 'bg-green-600', 'bg-red-600'];
const OPTION_ICONS = ['▲', '●', '■', '✦'];

// «Benjamín R.»: fits under an avatar and is still clear for the class.
function cardName(name = '') {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}

export default function ProjectorView() {
  const { code } = useParams();
  const socketRef = useRef(null);
  const [phase, setPhase] = useState('waiting');
  const [roomInfo, setRoomInfo] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [question, setQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerCount, setAnswerCount] = useState(0);
  const [revealData, setRevealData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [endSummary, setEndSummary] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  // The results screen stays up after the game ends, even though the room is closed by then.
  const markClosed = () => {
    clearInterval(timerRef.current);
    setPhase(prev => (prev === 'ended' ? prev : 'closed'));
  };

  // 404 means closed (or never existed); a network error proves nothing.
  const checkRoomStillOpen = () =>
    getRoom(code)
      .then(res => setRoomInfo(res.data.room))
      .catch(err => { if (err.response?.status === 404) markClosed(); });

  useEffect(() => {
    checkRoomStillOpen();

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    // Observer only: joining as teacher used to take game control away from the teacher's tab.
    // The key from the teacher's link lets a computer with no session show the room.
    const token = localStorage.getItem('academia_token') || '';
    const projectorKey = new URLSearchParams(window.location.hash.slice(1)).get('k') || '';
    socket.on('connect', () => socket.emit('projector:join', { token, projectorKey, roomCode: code }));

    socket.on('room:closed', markClosed);
    // projector:join is refused for a closed room, e.g. after reconnecting.
    socket.on('error', ({ message } = {}) => {
      if (message === 'No autorizado') {
        setPhase(prev => (prev === 'ended' || prev === 'closed' ? prev : 'unauthorized'));
      }
      checkRoomStillOpen();
    });

    socket.on('room:joined', (data) => {
      setParticipants(data.participants || []);
      setPhase(prev => (prev === 'unauthorized' ? 'waiting' : prev));
    });
    socket.on('room:participants', (data) => setParticipants(data.participants));

    socket.on('game:started', (data) => {
      setPhase('countdown');
      if (data?.subject) setRoomInfo(prev => (prev ? { ...prev, subject: data.subject } : prev));
    });

    socket.on('game:question', (data) => {
      setQuestion(data);
      setPhase('question');
      setRevealData(null);
      setAnswerCount(0);
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

    socket.on('game:answer_count', (data) => setAnswerCount(data.count));

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

    return () => {
      clearInterval(timerRef.current);
      socket.disconnect();
    };
  }, [code]);

  // Backstop for a room:closed missed while the socket was down: the lobby is
  // exactly where a stale code would keep students trying to join.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const poll = setInterval(checkRoomStillOpen, 15000);
    return () => clearInterval(poll);
  }, [phase, code]);

  const joinUrl = `${window.location.origin}/join/${code}`;

  return (
    <div className="h-screen bg-surface overflow-hidden flex flex-col p-6">
      {/* Waiting */}
      {phase === 'waiting' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <h1 className="text-8xl font-black text-brand-light mb-2">
            Academ<span className="text-gold">IA</span>
          </h1>
          {roomInfo && (
            <p className="text-gray-400 text-xl mb-8">
              {roomInfo.course_name} · {subjectLabel(roomInfo.subject)}
            </p>
          )}
          <div className="bg-card rounded-3xl px-16 py-10 text-center shadow-2xl border border-brand/20">
            <p className="text-gray-400 text-lg mb-2">Código de sala</p>
            <p className="text-9xl font-black text-gold tracking-[0.2em]">{code}</p>
            <p className="text-gray-500 mt-4 text-lg">Ingresa en: <span className="text-white">{joinUrl}</span></p>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3 max-w-6xl">
            {participants.map(p => (
              <div key={p.studentId} className="flex flex-col items-center w-24 animate-pop">
                {/* A full class has to fit under the code on one screen. */}
                <StudentAvatar avatar={p.avatar} name={p.name} size={participants.length > 20 ? 60 : 76} className="ring-4 ring-brand/50" />
                <span className="mt-1 text-brand-light font-bold text-base text-center leading-tight w-full truncate" title={p.name}>{cardName(p.name)}</span>
              </div>
            ))}
          </div>
          {participants.length > 0 && (
            <p className="text-gray-500 mt-4">{participants.length} alumno{participants.length !== 1 ? 's' : ''} conectado{participants.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      )}

      {/* Question */}
      {phase === 'question' && question && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-lg">
              Pregunta {question.questionIndex + 1} / {question.totalQuestions}
            </span>
            <div className="flex items-center gap-4">
              {isPaused ? (
                <span className="text-yellow-400 font-black text-3xl animate-pulse">⏸ PAUSADO</span>
              ) : (
                <>
                  <span className="text-gray-400 text-lg">{answerCount} respondieron</span>
                  <span className={`text-5xl font-black tabular-nums ${timeLeft <= 5 ? 'text-wrong' : 'text-gold'}`}>
                    {timeLeft}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="bg-card rounded-3xl p-8 mb-6 flex-shrink-0">
            <p className="text-4xl font-black text-center leading-tight">{question.text}</p>
          </div>

          {/* Timer bar */}
          <div className="h-3 bg-gray-800 rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-1000"
              style={{ width: `${(timeLeft / (question.timeMs / 1000)) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 flex-1">
            {question.options.map((opt, i) => (
              <div
                key={i}
                className={`${OPTION_COLORS[i]} rounded-2xl flex items-center gap-4 p-6 shadow-lg`}
              >
                <span className="text-4xl font-black opacity-60">{OPTION_ICONS[i]}</span>
                <span className="text-3xl font-bold">{opt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reveal */}
      {phase === 'reveal' && question && revealData && (
        <div className="flex-1 flex flex-col">
          <h2 className="text-3xl font-black text-center text-correct mb-6">
            ✓ Respuesta correcta
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {question.options.map((opt, i) => {
              const isCorrect = opt === revealData.correctAnswer;
              return (
                <div
                  key={i}
                  className={`${OPTION_COLORS[i]} rounded-2xl flex items-center gap-4 p-6 transition-all duration-500 ${
                    isCorrect ? 'ring-4 ring-white scale-105' : 'opacity-30'
                  }`}
                >
                  <span className="text-4xl font-black opacity-60">{OPTION_ICONS[i]}</span>
                  <span className="text-3xl font-bold">{opt}</span>
                  {isCorrect && <span className="ml-auto text-4xl">✓</span>}
                </div>
              );
            })}
          </div>

          <div className="bg-card rounded-2xl p-5">
            <p className="text-gray-400 text-lg text-center">
              💡 {question.hint}
            </p>
          </div>

          {/* Quick leaderboard */}
          <div className="mt-4 flex justify-center gap-6">
            {leaderboard.slice(0, 5).map(p => (
              <div key={p.studentId} className="text-center flex flex-col items-center">
                <StudentAvatar avatar={p.avatar} name={p.name} size={56} className={p.rank === 1 ? 'ring-4 ring-gold' : ''} />
                <div className={`text-2xl font-black ${p.rank === 1 ? 'text-gold' : 'text-gray-300'}`}>
                  #{p.rank}
                </div>
                <div className="text-sm text-gray-300 font-semibold">{p.name}</div>
                <Tokens value={p.score} size={20} className="text-gold font-bold" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* End */}
      {phase === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-8xl mb-4">🏆</p>
          <h2 className="text-5xl font-black mb-8">¡Ronda terminada!</h2>
          <div className="w-full max-w-lg space-y-3">
            {leaderboard.slice(0, 10).map(p => (
              <div
                key={p.studentId}
                className="bg-card rounded-2xl px-6 py-2 flex items-center justify-between"
              >
                <span className="flex items-center gap-3">
                  <span className={`font-black text-2xl w-12 ${p.rank === 1 ? 'text-gold' : p.rank === 2 ? 'text-gray-300' : p.rank === 3 ? 'text-orange-400' : 'text-gray-600'}`}>
                    #{p.rank}
                  </span>
                  <StudentAvatar avatar={p.avatar} name={p.name} size={48} />
                  <span className="text-xl font-semibold">{p.name}</span>
                </span>
                <Tokens value={p.score} size={30} className="text-gold font-black text-2xl" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refused: opened without the teacher's link and without a session */}
      {phase === 'unauthorized' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <h1 className="text-6xl font-black text-brand-light mb-10">
            Academ<span className="text-gold">IA</span>
          </h1>
          <h2 className="text-5xl font-black mb-6">Este proyector no pudo unirse a la sala {code}</h2>
          <p className="text-gray-400 text-2xl max-w-3xl">
            En el panel del profesor, usa «Abrir proyector ↗» y copia la dirección completa de esa pestaña.
            Solo el código de la sala no basta.
          </p>
        </div>
      )}

      {/* Closed by the teacher */}
      {phase === 'closed' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <h1 className="text-6xl font-black text-brand-light mb-10">
            Academ<span className="text-gold">IA</span>
          </h1>
          <h2 className="text-6xl font-black mb-4">Esta sala se cerró</h2>
          {roomInfo && (
            <p className="text-gray-400 text-2xl mb-2">
              {roomInfo.course_name} · {subjectLabel(roomInfo.subject)}
            </p>
          )}
          <p className="text-gray-500 text-xl mt-6">Para jugar otra vez, abre una sala nueva desde tu panel.</p>
          <Link
            to="/teacher"
            className="mt-8 bg-brand hover:bg-brand-dark text-white font-bold text-xl px-8 py-4 rounded-2xl transition-colors"
          >
            Ir a mi panel
          </Link>
        </div>
      )}

      {/* Room code badge (solo en espera) */}
      {phase === 'waiting' && (
        <div className="absolute top-4 right-6 text-right">
          <p className="text-gray-600 text-xs">Código</p>
          <p className="text-gold font-black text-xl tracking-widest">{code}</p>
        </div>
      )}
    </div>
  );
}
