import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login } from '../api/client';

export default function LoginPage() {
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
      loginSuccess(token, user);
      navigate('/teacher');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-tight text-brand-light mb-1">Academ<span className="text-gold">IA</span></h1>
          <p className="text-gray-400 text-sm">Plataforma educativa gamificada</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Correo institucional</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              placeholder="nombre@escuela.cl"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm">
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

        <p className="text-center text-gray-500 text-sm mt-6">
          ¿Eres alumno?{' '}
          <a href="/join" className="text-brand-light underline">Únete con un código</a>
        </p>
      </div>
    </div>
  );
}
