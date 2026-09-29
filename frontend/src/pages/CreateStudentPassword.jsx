import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkPasswordLink, createStudentPassword } from '../api/client';
import { studentLoginSuccess } from '../api/studentAuth';
import PasswordInput from '../components/PasswordInput';

function readToken() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
  // Out of the address bar and history once read: the link is a one-time credential.
  if (token) window.history.replaceState(null, '', window.location.pathname);
  return token;
}

const Wordmark = () => (
  <h1 className="text-5xl font-black tracking-tight text-brand-light mb-8 text-center">
    Academ<span className="text-gold">IA</span>
  </h1>
);

export default function CreateStudentPassword() {
  const [token] = useState(readToken);
  const [link, setLink] = useState(null); // { estado, nombre, email, error }
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setLink({ estado: 'invalido', error: 'Falta el enlace. Ábrelo de nuevo desde tu correo.' });
      return;
    }
    checkPasswordLink(token)
      .then(res => setLink(res.data))
      .catch(err => setLink({ estado: 'error', error: err.response?.data?.error || 'No pudimos revisar el enlace. Recarga la página.' }));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await createStudentPassword(token, password);
      studentLoginSuccess(res.data.token, res.data.student);
      navigate('/alumno', { replace: true });
    } catch (err) {
      const data = err.response?.data;
      if (data?.estado) setLink({ estado: data.estado, error: data.error });
      else setError(data?.error || 'No pudimos guardar tu contraseña. Inténtalo de nuevo.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Wordmark />
        <div className="bg-card rounded-2xl p-6 shadow-xl">
          {!link ? (
            <p className="text-gray-400 text-center">Revisando el enlace...</p>
          ) : link.estado !== 'valido' ? (
            <div className="space-y-4 text-center">
              <p role="alert" className="text-white font-semibold">{link.error}</p>
              <Link to="/?modo=alumno" className="block text-brand-light underline">Ir a la entrada de alumnos</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center">
                <h2 className="text-2xl font-black text-white">¡Hola, {link.nombre || 'alumno'}!</h2>
                <p className="text-gray-400 text-sm mt-1">Crea la contraseña para <span className="text-gray-200">{link.email}</span></p>
              </div>
              <div>
                <label htmlFor="new-password" className="block text-sm font-semibold text-gray-300 mb-1">Tu nueva contraseña</label>
                <PasswordInput
                  id="new-password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  autoFocus
                  describedBy="new-password-rule"
                />
                <p id="new-password-rule" className="text-gray-500 text-xs mt-1">
                  Al menos 8 caracteres, con una letra y un número. Por ejemplo: una palabra que te guste y tu número favorito.
                </p>
              </div>

              {error && <p role="alert" className="text-wrong text-sm text-center">{error}</p>}

              <button
                type="submit"
                disabled={saving || password.length < 8}
                className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-3 rounded-xl text-lg transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar y entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
