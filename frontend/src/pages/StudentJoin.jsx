import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoom } from '../api/client';

export default function StudentJoin() {
  const { code: urlCode } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState('code'); // code | pick_name | error
  const [code, setCode] = useState(urlCode || '');
  const [roomData, setRoomData] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (urlCode) lookupRoom(urlCode.toUpperCase());
  }, []);

  const lookupRoom = async (roomCode) => {
    setLoading(true);
    setError('');
    try {
      const res = await getRoom(roomCode.toUpperCase());
      setRoomData(res.data);
      setStep('pick_name');
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

  const handleJoin = () => {
    if (!selectedStudent || !roomData) return;
    // Store student selection in sessionStorage for game page
    sessionStorage.setItem('academia_student', JSON.stringify({
      id: selectedStudent.id,
      displayName: `${selectedStudent.first_name} ${selectedStudent.last_name}`.trim(),
    }));
    navigate(`/play/${roomData.room.code}`);
  };

  const filteredStudents = roomData?.students?.filter(s => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  }) || [];

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
            ¿Eres docente?{' '}
            <a href="/login" className="text-brand-light underline">Inicia sesión aquí</a>
          </p>
        </div>
      )}

      {step === 'pick_name' && roomData && (
        <div className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl">
          <div className="text-center mb-4">
            <p className="text-gray-400 text-sm">Sala: <span className="text-gold font-black">{roomData.room.code}</span></p>
            <p className="text-gray-400 text-sm">{roomData.room.course_name} · {roomData.room.subject}</p>
            <h2 className="text-xl font-bold mt-2">¿Cuál es tu nombre?</h2>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar mi nombre…"
            className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand mb-3"
          />

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {filteredStudents.map(s => {
              const name = `${s.first_name} ${s.last_name}`.trim();
              const isSelected = selectedStudent?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all ${
                    isSelected
                      ? 'bg-brand text-white ring-2 ring-brand-light'
                      : 'bg-surface text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {name}
                </button>
              );
            })}
            {filteredStudents.length === 0 && (
              <p className="text-gray-500 text-center py-4">No se encontraron alumnos</p>
            )}
          </div>

          <button
            onClick={handleJoin}
            disabled={!selectedStudent}
            className="w-full mt-4 bg-correct hover:bg-green-700 disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
          >
            {selectedStudent ? `¡Soy ${selectedStudent.first_name}! Entrar` : 'Selecciona tu nombre'}
          </button>
        </div>
      )}
    </div>
  );
}
