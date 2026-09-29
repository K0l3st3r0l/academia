import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRoom } from '../api/client';

export default function RoomCodeForm({ autoFocus = false }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const roomCode = code.trim().toUpperCase();
    if (roomCode.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await getRoom(roomCode);
      // StudentJoin reuses this roster instead of fetching the room a second time.
      navigate(`/join/${roomCode}`, { state: { roomData: res.data } });
    } catch (err) {
      setError(err.response?.data?.error || 'No encontramos esa sala. Revisa el código.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="room-code" className="block text-sm font-semibold text-gray-300 mb-2 text-center">
          Código de la sala
        </label>
        <input
          id="room-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="w-full bg-surface border-2 border-gray-700 focus:border-brand rounded-xl px-4 py-4 text-white text-3xl font-black text-center tracking-[0.4em] uppercase placeholder-gray-600 focus:outline-none"
          placeholder="XXXXXX"
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </div>

      {error && <p role="alert" className="text-wrong text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || code.trim().length < 6}
        className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
      >
        {loading ? 'Buscando...' : 'Entrar a la sala'}
      </button>
    </form>
  );
}
