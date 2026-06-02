import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createRoom, getCourses } from '../api/client';

const SUBJECTS = [
  { value: 'matematica', label: 'Matemática' },
  { value: 'lenguaje', label: 'Lenguaje' },
  { value: 'ciencias', label: 'Ciencias' },
  { value: 'historia', label: 'Historia' },
  { value: 'ingles', label: 'Inglés' },
  { value: 'general', label: 'General' },
];

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('matematica');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(true);

  useEffect(() => {
    getCourses()
      .then(res => setCourses(res.data))
      .catch(() => setError('No se pudieron cargar los cursos. Vuelve a iniciar sesión.'))
      .finally(() => setLoadingCourses(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selectedCourse) return;
    setError('');
    setLoading(true);
    try {
      const res = await createRoom(selectedCourse, selectedSubject);
      const { room } = res.data;
      navigate(`/teacher/game/${room.code}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear la sala');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <header className="max-w-2xl mx-auto flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-brand-light">
            Academ<span className="text-gold">IA</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Hola, {user?.first_name || user?.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/teacher/questions" className="text-gray-500 hover:text-gray-300 text-sm border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
            Banco de preguntas
          </Link>
          <button onClick={logout} className="text-gray-500 hover:text-gray-300 text-sm">
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-6">Crear nueva sala de juego</h2>

          {loadingCourses ? (
            <p className="text-gray-400">Cargando cursos...</p>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Curso</label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                  required
                >
                  <option value="">Selecciona un curso…</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Asignatura</label>
                <div className="grid grid-cols-3 gap-2">
                  {SUBJECTS.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSelectedSubject(s.value)}
                      className={`py-2 px-3 rounded-xl text-sm font-semibold transition-colors ${
                        selectedSubject === s.value
                          ? 'bg-brand text-white'
                          : 'bg-surface text-gray-400 hover:text-white border border-gray-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !selectedCourse}
                className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-bold py-4 rounded-xl text-lg transition-colors"
              >
                {loading ? 'Creando sala...' : 'Crear sala'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
