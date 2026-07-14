import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getStudentMe, getCharacterCatalog, getCharacterMe } from '../api/client';
import { getStudentUser, studentLogout } from '../api/studentAuth';
import Avatar from '../components/Avatar';

export default function AlumnoHome() {
  const [student, setStudent] = useState(getStudentUser());
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState(null);
  const [character, setCharacter] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getStudentMe()
      .then(res => setStudent(res.data.student))
      .catch(() => {
        studentLogout();
        navigate('/alumno/login', { replace: true });
      })
      .finally(() => setLoading(false));

    getCharacterCatalog().then(res => setCatalog(res.data));
    getCharacterMe()
      .then(res => setCharacter(res.data.character))
      .catch(() => setCharacter(null));
  }, []);

  const handleLogout = () => {
    studentLogout();
    navigate('/alumno/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <header className="w-full max-w-sm flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-brand-light">
          Academ<span className="text-gold">IA</span>
        </h1>
        <button onClick={handleLogout} className="text-gray-500 hover:text-gray-300 text-sm">
          Salir
        </button>
      </header>

      <main className="w-full max-w-sm space-y-6">
        <div className="bg-card rounded-2xl p-6 shadow-xl text-center">
          <h2 className="text-3xl font-black text-white mb-1">¡Hola, {student?.first_name || 'alumno'}!</h2>
          <p className="text-gray-500 text-sm">{student?.course_name}</p>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-xl text-center">
          <p className="text-gray-400 text-sm mb-1">Tus tokens</p>
          {loading ? (
            <p className="text-gray-500">Cargando...</p>
          ) : (
            <p className="text-5xl font-black text-gold">{student?.tokens_balance ?? 0}</p>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-xl text-center">
          {character ? (
            <>
              <div className="flex justify-center mb-3">
                <Avatar layers={character.layers} catalog={catalog} size={140} />
              </div>
              <Link
                to="/alumno/personaje"
                className="inline-block bg-surface hover:bg-gray-800 text-brand-light font-semibold px-5 py-2 rounded-xl transition-colors"
              >
                Editar personaje
              </Link>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-3">Aún no tienes personaje</p>
              <Link
                to="/alumno/personaje"
                className="inline-block bg-brand hover:bg-brand-dark text-white font-black px-6 py-3 rounded-xl text-lg transition-colors"
              >
                ¡Crea tu personaje!
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
