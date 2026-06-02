import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getRoom } from '../api/client';
import { SOCKET_URL } from '../api/client';

const OPTION_COLORS = ['bg-blue-600', 'bg-orange-500', 'bg-green-600', 'bg-red-600'];
const OPTION_ICONS = ['▲', '●', '■', '✦'];

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

  useEffect(() => {
    getRoom(code).then(res => setRoomInfo(res.data.room)).catch(() => {});

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    // Projector joins as an observer (no token, just listen)
    socket.emit('teacher:join', { token: localStorage.getItem('academia_token') || '', roomCode: code });

    socket.on('room:joined', (data) => setParticipants(data.participants || []));
    socket.on('room:participants', (data) => setParticipants(data.participants));

    socket.on('game:started', () => setPhase('countdown'));

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
              {roomInfo.course_name} · {roomInfo.subject}
            </p>
          )}
          <div className="bg-card rounded-3xl px-16 py-10 text-center shadow-2xl border border-brand/20">
            <p className="text-gray-400 text-lg mb-2">Código de sala</p>
            <p className="text-9xl font-black text-gold tracking-[0.2em]">{code}</p>
            <p className="text-gray-500 mt-4 text-lg">Ingresa en: <span className="text-white">{joinUrl}</span></p>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3 max-w-3xl">
            {participants.map(p => (
              <span key={p.studentId} className="bg-brand/30 border border-brand/50 text-brand-light px-4 py-2 rounded-full text-lg font-bold animate-pop">
                {p.name}
              </span>
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
              <div key={p.studentId} className="text-center">
                <div className={`text-2xl font-black ${p.rank === 1 ? 'text-gold' : 'text-gray-300'}`}>
                  #{p.rank}
                </div>
                <div className="text-sm text-gray-300 font-semibold">{p.name}</div>
                <div className="text-gold font-bold">{p.score}🪙</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* End */}
      {phase === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-8xl mb-4">🏆</p>
          <h2 className="text-5xl font-black mb-8">¡Actividad terminada!</h2>
          <div className="w-full max-w-lg space-y-3">
            {leaderboard.slice(0, 10).map(p => (
              <div
                key={p.studentId}
                className="bg-card rounded-2xl px-6 py-4 flex items-center justify-between"
              >
                <span>
                  <span className={`font-black text-2xl mr-3 ${p.rank === 1 ? 'text-gold' : p.rank === 2 ? 'text-gray-300' : p.rank === 3 ? 'text-orange-400' : 'text-gray-600'}`}>
                    #{p.rank}
                  </span>
                  <span className="text-xl font-semibold">{p.name}</span>
                </span>
                <span className="text-gold font-black text-2xl">{p.score} tokens</span>
              </div>
            ))}
          </div>
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
