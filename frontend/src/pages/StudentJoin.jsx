import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { getRoom, joinRoom } from '../api/client';
import { subjectLabel } from '../utils/subjects';

// 123456785 → 12.345.678-5 while the student types.
function formatRut(value) {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 10);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${clean.slice(-1)}`;
}

export default function StudentJoin() {
  const { code: urlCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // The welcome page already looked the room up; reuse it only if it's the same room.
  const preloaded = location.state?.roomData?.room?.code === urlCode?.toUpperCase()
    ? location.state.roomData
    : null;

  const [step, setStep] = useState(preloaded ? 'rut' : 'code'); // code | rut | confirm
  const [code, setCode] = useState(urlCode || '');
  const [roomData, setRoomData] = useState(preloaded);
  const [rut, setRut] = useState('');
  const [identified, setIdentified] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (urlCode && !preloaded) lookupRoom(urlCode.toUpperCase());
  }, []);

  const lookupRoom = async (roomCode) => {
    setLoading(true);
    setError('');
    try {
      const res = await getRoom(roomCode.toUpperCase());
      setRoomData(res.data);
      setStep('rut');
    } catch (err) {
      setError(err.response?.data?.error || 'Sala no encontrada. Verifica el código.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    if (code.trim().length < 6) return;
    lookupRoom(code.trim().toUpperCase());
  };

  const handleRutSubmit = async (e) => {
    e.preventDefault();
    if (rut.length < 3 || !roomData) return;
    setLoading(true);
    setError('');
    try {
      const res = await joinRoom(roomData.room.code, rut);
      setIdentified(res.data);
      setStep('confirm');
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos revisar tu RUT. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    if (!identified || !roomData) return;
    sessionStorage.setItem('academia_student', JSON.stringify({
      ticket: identified.ticket,
      displayName: identified.student.displayName,
    }));
    navigate(`/play/${roomData.room.code}`);
  };

  const backToRut = () => {
    setIdentified(null);
    setRut('');
    setError('');
    setStep('rut');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <h1 className="text-5xl font-black text-brand-light mb-1">
        Academ<span className="text-gold">IA</span>
      </h1>
      <p className="text-gray-400 mb-8">Plataforma educativa gamificada</p>

      {step === 'code' && (
        <div className="w-full max-w-sm bg-card rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-4 text-center">Ingresa tu código de sala</h2>
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full bg-surface border-2 border-gray-700 focus:border-brand rounded-xl px-4 py-4 text-white text-3xl font-black text-center tracking-[0.4em] uppercase placeholder-gray-600 focus:outline-none"
              placeholder="XXXXXX"
              autoFocus
            />
            {error && (
              <p className="text-wrong text-sm text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || code.trim().length < 6}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
            >
              {loading ? 'Buscando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-center text-gray-500 text-sm mt-4">
            <Link to="/" className="text-brand-light underline">Volver al inicio</Link>
          </p>
        </div>
      )}

      {step === 'rut' && roomData && (
        <div className="w-full max-w-sm bg-card rounded-2xl p-6 shadow-xl">
          <div className="text-center mb-4">
            <p className="text-gray-400 text-sm">Sala: <span className="text-gold font-black">{roomData.room.code}</span></p>
            <p className="text-gray-400 text-sm">{roomData.room.course_name} · {subjectLabel(roomData.room.subject)}</p>
          </div>

          <form onSubmit={handleRutSubmit} className="space-y-4">
            <div>
              <label htmlFor="join-rut" className="block text-xl font-bold mb-3 text-center">
                Escribe tu RUT
              </label>
              <input
                id="join-rut"
                type="text"
                value={rut}
                onChange={(e) => setRut(formatRut(e.target.value))}
                className="w-full bg-surface border-2 border-gray-700 focus:border-brand rounded-xl px-4 py-4 text-white text-2xl font-black text-center placeholder-gray-600 focus:outline-none"
                placeholder="12.345.678-9"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                aria-describedby="join-rut-hint"
              />
              <p id="join-rut-hint" className="text-center text-gray-500 text-xs mt-1">
                Si no lo sabes, pídeselo a tu profesor
              </p>
            </div>

            {error && <p role="alert" className="text-wrong text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || rut.length < 3}
              className="w-full bg-correct hover:bg-green-700 disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
            >
              {loading ? 'Revisando...' : 'Continuar'}
            </button>
          </form>
        </div>
      )}

      {step === 'confirm' && identified && roomData && (
        <div className="w-full max-w-sm bg-card rounded-2xl p-6 shadow-xl text-center space-y-4">
          <p className="text-gray-400 text-sm">Sala: <span className="text-gold font-black">{roomData.room.code}</span></p>
          <h2 className="text-xl font-bold">¿Eres tú?</h2>
          <p className="text-2xl font-black text-white">{identified.student.displayName}</p>
          <button
            onClick={handleJoin}
            className="w-full bg-correct hover:bg-green-700 text-white font-black py-4 rounded-xl text-xl transition-colors"
          >
            ¡Sí, entrar!
          </button>
          <button
            onClick={backToRut}
            className="w-full bg-surface hover:bg-gray-800 text-gray-300 font-semibold py-3 rounded-xl transition-colors"
          >
            No, corregir mi RUT
          </button>
        </div>
      )}
    </div>
  );
}
