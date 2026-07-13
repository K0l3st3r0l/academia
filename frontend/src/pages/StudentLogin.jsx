import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentLogin } from '../api/client';
import { studentLoginSuccess } from '../api/studentAuth';

export default function StudentLogin() {
  const [rut, setRut] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinRefs = [useRef(), useRef(), useRef(), useRef()];
  const navigate = useNavigate();

  const pin = pinDigits.join('');

  const handlePinChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setPinDigits(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 3) pinRefs[index + 1].current?.focus();
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rut.trim() || pin.length < 4) return;
    setError('');
    setLoading(true);
    try {
      const res = await studentLogin(rut.trim(), pin);
      studentLoginSuccess(res.data.token, res.data.student);
      navigate('/alumno');
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar tu sesión. ¡Inténtalo de nuevo!');
      setPinDigits(['', '', '', '']);
      pinRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <h1 className="text-5xl font-black text-brand-light mb-1">
        Academ<span className="text-gold">IA</span>
      </h1>
      <p className="text-gray-400 mb-8">Entra con tu RUT y tu PIN</p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-card rounded-2xl p-6 shadow-xl space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2 text-center">Tu RUT</label>
          <input
            type="text"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            className="w-full bg-surface border-2 border-gray-700 focus:border-brand rounded-xl px-4 py-4 text-white text-2xl font-black text-center placeholder-gray-600 focus:outline-none"
            placeholder="12345678-9"
            autoFocus
            autoComplete="off"
          />
          <p className="text-center text-gray-500 text-xs mt-1">Puedes escribirlo con o sin puntos y guión</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2 text-center">Tu PIN</label>
          <div className="flex justify-center gap-3">
            {pinDigits.map((digit, i) => (
              <input
                key={i}
                ref={pinRefs[i]}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handlePinChange(i, e.target.value)}
                onKeyDown={(e) => handlePinKeyDown(i, e)}
                className="w-14 h-16 bg-surface border-2 border-gray-700 focus:border-brand rounded-xl text-white text-3xl font-black text-center focus:outline-none"
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-wrong text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !rut.trim() || pin.length < 4}
          className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className="text-center text-gray-500 text-sm mt-6">
        ¿Vienes de una sala con código?{' '}
        <a href="/join" className="text-brand-light underline">Únete aquí</a>
      </p>
    </div>
  );
}
