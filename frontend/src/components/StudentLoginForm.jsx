import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentLogin } from '../api/client';
import { studentLoginSuccess } from '../api/studentAuth';

const PIN_LENGTH = 4;

export default function StudentLoginForm({ autoFocus = false }) {
  const [rut, setRut] = useState('');
  const [pinDigits, setPinDigits] = useState(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinRefs = [useRef(), useRef(), useRef(), useRef()];
  const navigate = useNavigate();

  const pin = pinDigits.join('');

  const handlePinChange = (index, value) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      setPinDigits(prev => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    // A pasted PIN arrives as several digits in one box: spread them forward.
    const incoming = digits.length > 1 ? digits.slice(0, PIN_LENGTH - index) : digits.slice(-1);
    setPinDigits(prev => {
      const next = [...prev];
      [...incoming].forEach((d, offset) => { next[index + offset] = d; });
      return next;
    });
    const nextIndex = Math.min(index + incoming.length, PIN_LENGTH - 1);
    pinRefs[nextIndex].current?.focus();
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rut.trim() || pin.length < PIN_LENGTH) return;
    setError('');
    setLoading(true);
    try {
      const res = await studentLogin(rut.trim(), pin);
      studentLoginSuccess(res.data.token, res.data.student);
      navigate('/alumno');
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar tu sesión. ¡Inténtalo de nuevo!');
      setPinDigits(Array(PIN_LENGTH).fill(''));
      pinRefs[0].current?.focus();
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="student-rut" className="block text-sm font-semibold text-gray-300 mb-2 text-center">
          Tu RUT
        </label>
        <input
          id="student-rut"
          type="text"
          value={rut}
          onChange={(e) => setRut(e.target.value)}
          className="w-full bg-surface border-2 border-gray-700 focus:border-brand rounded-xl px-4 py-4 text-white text-2xl font-black text-center placeholder-gray-600 focus:outline-none"
          placeholder="12345678-9"
          autoFocus={autoFocus}
          autoComplete="off"
          aria-describedby="student-rut-hint"
        />
        <p id="student-rut-hint" className="text-center text-gray-500 text-xs mt-1">
          Puedes escribirlo con o sin puntos y guion
        </p>
      </div>

      <fieldset>
        <legend className="block w-full text-sm font-semibold text-gray-300 mb-2 text-center">Tu PIN</legend>
        <div className="flex justify-center gap-3">
          {pinDigits.map((digit, i) => (
            <input
              key={i}
              ref={pinRefs[i]}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label={`Número ${i + 1} del PIN`}
              value={digit}
              onChange={(e) => handlePinChange(i, e.target.value)}
              onKeyDown={(e) => handlePinKeyDown(i, e)}
              className="w-14 h-16 bg-surface border-2 border-gray-700 focus:border-brand rounded-xl text-white text-3xl font-black text-center focus:outline-none"
            />
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-wrong text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !rut.trim() || pin.length < PIN_LENGTH}
        className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
