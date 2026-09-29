import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentEmailLogin, requestPasswordLink } from '../api/client';
import { studentLoginSuccess } from '../api/studentAuth';
import PasswordInput from './PasswordInput';
import StudentLoginForm from './StudentLoginForm';

const INPUT_CLASS = 'w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand';
const PRIMARY_CLASS = 'w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-3 rounded-xl text-lg transition-colors';
const LINK_CLASS = 'block mx-auto text-sm text-brand-light underline';

function EmailLogin({ domain, autoFocus, email, setEmail, onFirstTime }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await studentEmailLogin(email.trim(), password);
      studentLoginSuccess(res.data.token, res.data.student);
      navigate('/alumno');
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar tu sesión. ¡Inténtalo de nuevo!');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="student-email" className="block text-sm font-semibold text-gray-300 mb-1">Tu correo del colegio</label>
        <input
          id="student-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT_CLASS}
          aria-describedby="student-email-hint"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          required
        />
        <p id="student-email-hint" className="text-gray-500 text-xs mt-1 break-all">Ejemplo: nombre.apellido.apellido@{domain}</p>
      </div>
      <div>
        <label htmlFor="student-password" className="block text-sm font-semibold text-gray-300 mb-1">Tu contraseña</label>
        <PasswordInput id="student-password" value={password} onChange={setPassword} autoComplete="current-password" />
      </div>

      {error && <p role="alert" className="text-wrong text-sm text-center">{error}</p>}

      <button type="submit" disabled={loading} className={PRIMARY_CLASS}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
      <button type="button" onClick={onFirstTime} className={LINK_CLASS}>
        Primera vez u olvidé mi contraseña
      </button>
    </form>
  );
}

function LinkRequest({ domain, email, setEmail, onBack }) {
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await requestPasswordLink(email.trim());
      setSent(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos enviar el enlace. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p role="status" className="text-white font-semibold">{sent}</p>
        <p className="text-gray-400 text-sm">Abre el correo y aprieta «Crear mi contraseña». El enlace vence en 1 hora.</p>
        <button type="button" onClick={onBack} className={LINK_CLASS}>Volver a entrar</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-gray-300 text-sm text-center">
        Te enviaremos un enlace a tu correo del colegio para que crees tu contraseña.
      </p>
      <div>
        <label htmlFor="link-email" className="block text-sm font-semibold text-gray-300 mb-1">Tu correo del colegio</label>
        <input
          id="link-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT_CLASS}
          aria-describedby="link-email-hint"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
        />
        <p id="link-email-hint" className="text-gray-500 text-xs mt-1 break-all">Ejemplo: nombre.apellido.apellido@{domain}</p>
      </div>

      {error && <p role="alert" className="text-wrong text-sm text-center">{error}</p>}

      <button type="submit" disabled={loading} className={PRIMARY_CLASS}>
        {loading ? 'Enviando...' : 'Enviarme el enlace'}
      </button>
      <button type="button" onClick={onBack} className={LINK_CLASS}>Ya tengo contraseña</button>
    </form>
  );
}

// Students from 3° básico up sign in with their school email; RUT + PIN stays for
// whoever can't use theirs (address outside the naming rule, duplicate record).
export default function StudentAccess({ domain, autoFocus = false }) {
  const [mode, setMode] = useState('login'); // login | link | pin
  const [email, setEmail] = useState('');

  if (mode === 'pin') {
    return (
      <div className="space-y-4">
        <StudentLoginForm autoFocus />
        <button type="button" onClick={() => setMode('login')} className={LINK_CLASS}>Entrar con mi correo</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === 'login' ? (
        <EmailLogin domain={domain} autoFocus={autoFocus} email={email} setEmail={setEmail} onFirstTime={() => setMode('link')} />
      ) : (
        <LinkRequest domain={domain} email={email} setEmail={setEmail} onBack={() => setMode('login')} />
      )}
      <p className="text-center text-gray-500 text-sm border-t border-gray-700 pt-4">
        ¿Tu profesor te dio un PIN?{' '}
        <button type="button" onClick={() => setMode('pin')} className="text-brand-light underline">Entrar con RUT y PIN</button>
      </p>
    </div>
  );
}
