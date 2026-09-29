import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, hasTeacherRole } from '../context/AuthContext';
import { login } from '../api/client';

export default function TeacherLoginForm({ autoFocus = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginSuccess } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(email, password);
      const { token, user } = res.data;
      // Any Anahuac account authenticates; only staff roles get the teacher panel.
      if (!hasTeacherRole(user)) {
        setError('Tu cuenta no tiene perfil docente en AcademIA.');
        setLoading(false);
        return;
      }
      loginSuccess(token, user);
      navigate('/teacher');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="teacher-email" className="block text-sm font-semibold text-gray-300 mb-1">
          Correo institucional
        </label>
        <input
          id="teacher-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
          placeholder="nombre@escuela.cl"
          autoComplete="username"
          autoFocus={autoFocus}
          required
        />
      </div>
      <div>
        <label htmlFor="teacher-password" className="block text-sm font-semibold text-gray-300 mb-1">
          Contraseña
        </label>
        <input
          id="teacher-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      {error && (
        <div role="alert" className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
      >
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>
    </form>
  );
}
