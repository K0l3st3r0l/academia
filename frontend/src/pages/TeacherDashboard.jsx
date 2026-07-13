import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  createRoom, getCourses, getRoomHistory, getSessionDetail,
  getStudentsByCourse, resetStudentPin, resetStudentPinsBulk,
} from '../api/client';

const SUBJECTS = [
  { value: 'matematica', label: 'Matemática' },
  { value: 'lenguaje', label: 'Lenguaje' },
  { value: 'ciencias', label: 'Ciencias' },
  { value: 'historia', label: 'Historia' },
  { value: 'ingles', label: 'Inglés' },
  { value: 'general', label: 'General' },
];

const SUBJECT_LABELS = Object.fromEntries(SUBJECTS.map(s => [s.value, s.label]));

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

function formatMs(ms) {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('matematica');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(true);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedRoomId, setExpandedRoomId] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const [pinCourse, setPinCourse] = useState('');
  const [pinStudents, setPinStudents] = useState([]);
  const [loadingPinStudents, setLoadingPinStudents] = useState(false);
  const [pinError, setPinError] = useState('');
  const [revealedPins, setRevealedPins] = useState({});
  const [resettingId, setResettingId] = useState(null);
  const [bulkPins, setBulkPins] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    getCourses()
      .then(res => setCourses(res.data))
      .catch(() => setError('No se pudieron cargar los cursos. Vuelve a iniciar sesión.'))
      .finally(() => setLoadingCourses(false));

    getRoomHistory()
      .then(res => setHistory(res.data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  useEffect(() => {
    if (!pinCourse) {
      setPinStudents([]);
      return;
    }
    setLoadingPinStudents(true);
    setPinError('');
    getStudentsByCourse(pinCourse)
      .then(res => setPinStudents(res.data))
      .catch(() => setPinError('No se pudieron cargar los alumnos de este curso.'))
      .finally(() => setLoadingPinStudents(false));
  }, [pinCourse]);

  const handleResetPin = async (studentId) => {
    setResettingId(studentId);
    setPinError('');
    try {
      const res = await resetStudentPin(studentId);
      setRevealedPins(prev => ({ ...prev, [studentId]: res.data.pin }));
      setPinStudents(prev => prev.map(s => s.id === studentId ? { ...s, has_pin: true } : s));
    } catch {
      setPinError('No se pudo generar el PIN.');
    } finally {
      setResettingId(null);
    }
  };

  const handleBulkReset = async () => {
    if (!pinCourse) return;
    if (!window.confirm(`¿Generar PINs nuevos para todo el curso "${pinCourse}"? Los PINs anteriores dejarán de funcionar.`)) return;
    setBulkLoading(true);
    setPinError('');
    try {
      const res = await resetStudentPinsBulk(pinCourse);
      setBulkPins(res.data);
      setPinStudents(prev => prev.map(s => ({ ...s, has_pin: true })));
    } catch {
      setPinError('No se pudieron generar los PINs del curso.');
    } finally {
      setBulkLoading(false);
    }
  };

  const copyBulkPins = () => {
    if (!bulkPins) return;
    const text = bulkPins.map(s => `${s.nombre}: ${s.pin}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const openSession = async (sessionId) => {
    setSessionError('');
    setSessionDetail(null);
    setLoadingSession(true);
    try {
      const res = await getSessionDetail(sessionId);
      setSessionDetail(res.data);
    } catch (err) {
      setSessionError(err.response?.data?.error || 'Error al cargar la sesión');
    } finally {
      setLoadingSession(false);
    }
  };

  const handleRoomClick = (room) => {
    if (room.sessions.length === 1) {
      openSession(room.sessions[0].id);
    } else if (room.sessions.length > 1) {
      setExpandedRoomId(expandedRoomId === room.id ? null : room.id);
    }
  };

  const closeSessionModal = () => {
    setSessionDetail(null);
    setSessionError('');
  };

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

        <div className="bg-card rounded-2xl p-6 shadow-xl mt-6">
          <h2 className="text-xl font-bold mb-6">Historial de sesiones</h2>

          {loadingHistory ? (
            <p className="text-gray-400">Cargando historial...</p>
          ) : history.length === 0 ? (
            <p className="text-gray-400">Aún no hay salas registradas.</p>
          ) : (
            <div className="space-y-2">
              {history.map(room => (
                <div key={room.id}>
                  <button
                    type="button"
                    onClick={() => handleRoomClick(room)}
                    className="w-full text-left bg-surface border border-gray-700 hover:border-brand rounded-xl px-4 py-3 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {room.course_name} · {SUBJECT_LABELS[room.subject] || room.subject}
                        </p>
                        <p className="text-sm text-gray-400">
                          {formatDateTime(room.created_at)} · código {room.code}
                        </p>
                      </div>
                      <div className="text-right text-sm text-gray-400 shrink-0">
                        <p>{room.student_count} alumno{room.student_count === 1 ? '' : 's'}</p>
                        <p>{room.sessions.length} partida{room.sessions.length === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                  </button>

                  {expandedRoomId === room.id && (
                    <div className="ml-4 mt-2 space-y-1">
                      {room.sessions.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => openSession(s.id)}
                          className="w-full text-left bg-surface/60 border border-gray-800 hover:border-brand rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors"
                        >
                          {formatDateTime(s.started_at)} — {SUBJECT_LABELS[s.subject] || s.subject}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-xl mt-6">
          <h2 className="text-xl font-bold mb-6">PINs de alumnos</h2>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-300 mb-2">Curso</label>
            <select
              value={pinCourse}
              onChange={(e) => { setPinCourse(e.target.value); setPinError(''); setRevealedPins({}); }}
              className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
            >
              <option value="">Selecciona un curso…</option>
              {courses.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {pinError && (
            <div className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm mb-4">
              {pinError}
            </div>
          )}

          {pinCourse && (
            <>
              <button
                type="button"
                onClick={handleBulkReset}
                disabled={bulkLoading || loadingPinStudents || pinStudents.length === 0}
                className="w-full bg-gold hover:brightness-95 disabled:opacity-40 text-surface font-black py-3 rounded-xl mb-4 transition-colors"
              >
                {bulkLoading ? 'Generando...' : 'Generar PINs del curso'}
              </button>

              {loadingPinStudents ? (
                <p className="text-gray-400">Cargando alumnos...</p>
              ) : pinStudents.length === 0 ? (
                <p className="text-gray-400">No hay alumnos sincronizados para este curso. Crea una sala primero.</p>
              ) : (
                <div className="space-y-2">
                  {pinStudents.map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-surface border border-gray-700 rounded-xl px-4 py-3 gap-3">
                      <div>
                        <p className="font-semibold">{s.first_name} {s.last_name}</p>
                        <p className="text-xs text-gray-500">
                          {s.has_pin ? 'PIN asignado' : 'Sin PIN asignado'}
                          {s.last_login_at && ` · último ingreso ${formatDateTime(s.last_login_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {revealedPins[s.id] && (
                          <span className="text-gold font-black text-lg tracking-widest">{revealedPins[s.id]}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResetPin(s.id)}
                          disabled={resettingId === s.id}
                          className="text-sm border border-gray-700 hover:border-brand text-gray-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {resettingId === s.id ? 'Generando...' : 'Restablecer PIN'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {bulkPins && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 print:static print:bg-white print:p-0"
          onClick={() => setBulkPins(null)}
        >
          <div
            id="printable-pins"
            className="bg-card rounded-2xl p-6 shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto print:max-h-none print:shadow-none print:bg-white print:text-black"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 print:hidden">
              <h3 className="text-lg font-bold">PINs generados — {pinCourse}</h3>
              <button onClick={() => setBulkPins(null)} className="text-gray-500 hover:text-gray-300">Cerrar</button>
            </div>
            <p className="text-sm text-gray-400 mb-4 print:hidden">
              Anota o dicta estos PINs a tus alumnos. No podrás volver a consultarlos después de cerrar esta ventana.
            </p>
            <h3 className="hidden print:block text-lg font-bold mb-3">PINs — {pinCourse}</h3>
            <div className="space-y-1 mb-4">
              {bulkPins.map(s => (
                <div key={s.id} className="flex justify-between bg-surface border border-gray-700 rounded-lg px-3 py-2 print:bg-white print:border-gray-300 print:text-black">
                  <span>{s.nombre}</span>
                  <span className="text-gold font-black tracking-widest print:text-black">{s.pin}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 print:hidden">
              <button onClick={copyBulkPins} className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-xl transition-colors">
                Copiar
              </button>
              <button onClick={() => window.print()} className="flex-1 bg-surface border border-gray-700 hover:border-brand text-gray-200 font-bold py-2 rounded-xl transition-colors">
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {(loadingSession || sessionDetail || sessionError) && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={closeSessionModal}
        >
          <div
            className="bg-card rounded-2xl p-6 shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingSession && <p className="text-gray-400">Cargando sesión...</p>}

            {sessionError && (
              <div className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm">
                {sessionError}
              </div>
            )}

            {sessionDetail && (
              <>
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div>
                    <h3 className="text-lg font-bold">{sessionDetail.session.course_name}</h3>
                    <p className="text-sm text-gray-400">
                      {SUBJECT_LABELS[sessionDetail.session.subject] || sessionDetail.session.subject} · código {sessionDetail.session.code}
                    </p>
                    <p className="text-sm text-gray-400">
                      {formatDateTime(sessionDetail.session.started_at)} — {formatDateTime(sessionDetail.session.ended_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeSessionModal}
                    className="text-gray-500 hover:text-gray-300 shrink-0"
                  >
                    Cerrar
                  </button>
                </div>

                {sessionDetail.students.length === 0 ? (
                  <p className="text-gray-400 text-sm">Sin respuestas registradas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-700">
                          <th className="py-2 pr-3">Alumno</th>
                          <th className="py-2 pr-3">Correctas</th>
                          <th className="py-2 pr-3">Tiempo prom.</th>
                          <th className="py-2 pr-3">Tokens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionDetail.students.map(s => (
                          <tr key={s.student_id} className="border-b border-gray-800">
                            <td className="py-2 pr-3">{s.name}</td>
                            <td className="py-2 pr-3">{s.correct_answers}/{s.total_answers}</td>
                            <td className="py-2 pr-3">{formatMs(s.avg_time_ms)}</td>
                            <td className="py-2 pr-3 text-gold font-semibold">{s.tokens_earned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
