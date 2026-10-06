import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCourses, getStudentsByCourse, giveCopihues, getCopihueAwards, undoCopihueAward, getReadingSync, runReadingSyncNow } from '../api/client';
import { CopihueIcon, Copihues } from '../components/Copihue';
import { shortName } from '../utils/displayName';

// Reasons a teacher picks most; the text stays editable. Convivencia first: that is what the
// copihues add on top of the tokens, which already reward effort in the game.
const REASONS = [
  'Ayudó a un compañero',
  'Trabajó en equipo',
  'Fue respetuoso',
  'Participó en clase',
  'Se esforzó mucho',
  'Mejoró mucho',
];
const MAX_REASON = 120;

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Reading speed lives in Anahuac (ProsodIA evaluations). It is checked by itself whenever
// someone with UTP access to it logs in; the button checks now.
function ReadingSpeed() {
  const [last, setLast] = useState(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getReadingSync().then(res => setLast(res.data.last)).catch(() => {});
  }, []);

  const check = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const { data } = await runReadingSyncNow();
      setLast(data.last);
      const n = data.summary?.awarded ?? 0;
      setMessage({ text: n ? `${n === 1 ? '1 alumno recibió' : `${n} alumnos recibieron`} copihues por leer más rápido.` : 'No hay mejoras nuevas desde la última revisión.' });
    } catch (err) {
      setMessage({ error: true, text: err.response?.data?.error ?? 'No se pudo revisar.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="bg-card rounded-2xl p-6 shadow-xl mt-6">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><CopihueIcon size={24} /> Velocidad lectora</h2>
      <p className="text-sm text-gray-300">
        Cuando un alumno lee más palabras por minuto que en su evaluación anterior con ProsodIA, recibe
        3 copihues. Cuenta la mejora, no el nivel: también gana quien lee lento pero avanza. Su primera
        evaluación con ProsodIA es el punto de partida.
      </p>
      <p className="text-xs text-gray-500 mt-2">
        Se revisa solo cuando entra alguien con acceso a velocidad lectora en Anahuac (UTP).
        {last && ` Última revisión: ${formatDate(last.at)}.`}
      </p>
      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="mt-4 border border-gray-700 hover:border-brand text-gray-200 hover:text-white disabled:opacity-40 rounded-xl px-4 py-2 font-semibold"
      >
        {checking ? 'Revisando…' : 'Revisar ahora'}
      </button>
      {message && <p role="status" className={`text-sm font-semibold mt-3 ${message.error ? 'text-wrong' : 'text-correct'}`}>{message.text}</p>}
    </section>
  );
}

export default function TeacherCopihues() {
  const [courses, setCourses] = useState([]);
  const [course, setCourse] = useState('');
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(1);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [awards, setAwards] = useState([]);
  const [perStudent, setPerStudent] = useState({});

  useEffect(() => {
    getCourses().then(res => setCourses(res.data)).catch(() => setMessage({ error: true, text: 'No se pudieron cargar los cursos.' }));
  }, []);

  const loadAwards = c => getCopihueAwards(c)
    .then(res => { setAwards(res.data.awards); setPerStudent(res.data.perStudent); })
    .catch(() => {});

  useEffect(() => {
    setPicked(new Set());
    setMessage(null);
    setStudents([]);
    setAwards([]);
    setPerStudent({});
    if (!course) return;
    setLoadingStudents(true);
    getStudentsByCourse(course)
      .then(res => setStudents(res.data.students))
      .catch(() => setMessage({ error: true, text: 'No se pudieron cargar los alumnos de este curso.' }))
      .finally(() => setLoadingStudents(false));
    loadAwards(course);
  }, [course]);

  const toggle = id => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const give = async () => {
    setSending(true);
    setMessage(null);
    try {
      await giveCopihues([...picked], amount, reason.trim());
      const n = picked.size;
      setMessage({ text: `Listo: ${n === 1 ? '1 alumno recibió' : `${n} alumnos recibieron`} ${amount === 1 ? '1 copihue' : `${amount} copihues`}.` });
      setPicked(new Set());
      loadAwards(course);
    } catch (err) {
      setMessage({ error: true, text: err.response?.data?.error ?? 'No se pudieron entregar.' });
    } finally {
      setSending(false);
    }
  };

  const undo = async id => {
    try {
      await undoCopihueAward(id);
      loadAwards(course);
    } catch (err) {
      setMessage({ error: true, text: err.response?.data?.error ?? 'No se pudo deshacer.' });
    }
  };

  const ready = picked.size > 0 && reason.trim().length > 0 && !sending;
  const quiet = students.filter(s => !perStudent[s.id]).length;

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/teacher" className="text-gray-400 hover:text-white text-sm">← Volver al panel</Link>
        <h1 className="text-3xl font-black mt-2 flex items-center gap-2">
          <CopihueIcon size={34} /> Copihues
        </h1>
        <p className="text-gray-400 mt-1">
          Reconoce lo que ves en la sala: ayudar, convivir, participar. Los tokens premian el esfuerzo en el juego;
          los copihues, lo que tú reconoces. Los alumnos los canjean por cosas especiales.
        </p>

        <section className="bg-card rounded-2xl p-6 shadow-xl mt-6 space-y-5">
          <div>
            <label htmlFor="copihue-course" className="block text-sm font-semibold text-gray-300 mb-2">Curso</label>
            <select
              id="copihue-course"
              value={course}
              onChange={e => setCourse(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
            >
              <option value="">Selecciona un curso…</option>
              {courses.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {course && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-300">
                  ¿A quién? {picked.size > 0 && <span className="text-brand-light">({picked.size})</span>}
                </p>
                {students.length > 0 && (
                  <div className="flex gap-3 text-sm">
                    <button type="button" onClick={() => setPicked(new Set(students.map(s => s.id)))} className="text-brand-light hover:underline">Todo el curso</button>
                    {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="text-gray-400 hover:underline">Ninguno</button>}
                  </div>
                )}
              </div>
              {loadingStudents ? (
                <p className="text-gray-400">Cargando alumnos…</p>
              ) : (
                <>
                  {students.length > 0 && quiet > 0 && (
                    <p className="text-xs text-gray-400 mb-2">
                      {quiet === students.length
                        ? 'Nadie de este curso ha recibido copihues este mes.'
                        : `${quiet} ${quiet === 1 ? 'alumno no ha' : 'alumnos no han'} recibido copihues este mes (en gris).`}
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {students.map(s => {
                      const on = picked.has(s.id);
                      const got = perStudent[s.id] ?? 0;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(s.id)}
                          className={`text-left rounded-xl border px-3 py-2 transition-colors ${on ? 'bg-brand/25 border-brand text-white' : 'bg-surface border-gray-700 text-gray-200 hover:border-gray-500'}`}
                        >
                          <span className="block font-semibold leading-tight">{shortName(s)}</span>
                          <span className={`text-xs inline-flex items-center gap-1 ${got ? 'text-[#FF6B7A]' : 'text-gray-500'}`}>
                            <CopihueIcon size={13} /> {got} este mes
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {course && students.length > 0 && (
            <>
              <div>
                <label htmlFor="copihue-reason" className="block text-sm font-semibold text-gray-300 mb-2">¿Por qué?</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {REASONS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`text-sm rounded-full border px-3 py-1 ${reason === r ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  id="copihue-reason"
                  value={reason}
                  maxLength={MAX_REASON}
                  onChange={e => setReason(e.target.value)}
                  placeholder="O escribe el motivo con tus palabras"
                  className="w-full bg-surface border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                />
                <p className="text-xs text-gray-500 mt-1">El alumno lo verá junto a tu nombre.</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-300 mb-2">¿Cuántos a cada uno?</p>
                <div className="flex gap-2" role="radiogroup" aria-label="Cantidad de copihues">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={amount === n}
                      onClick={() => setAmount(n)}
                      className={`flex-1 rounded-xl border py-2 font-black inline-flex items-center justify-center gap-1 ${amount === n ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-300'}`}
                    >
                      <CopihueIcon size={18} /> {n}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={give}
                disabled={!ready}
                className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-3 rounded-xl text-lg"
              >
                {sending ? 'Entregando…' : picked.size
                  ? `Entregar ${amount === 1 ? '1 copihue' : `${amount} copihues`} a ${picked.size === 1 ? '1 alumno' : `${picked.size} alumnos`}`
                  : 'Elige a quién reconocer'}
              </button>
            </>
          )}

          {message && (
            <p role="status" className={`text-sm font-semibold ${message.error ? 'text-wrong' : 'text-correct'}`}>{message.text}</p>
          )}
        </section>

        <ReadingSpeed />

        {course && awards.length > 0 && (
          <section className="bg-card rounded-2xl p-6 shadow-xl mt-6">
            <h2 className="text-xl font-bold mb-1">Entregados este mes</h2>
            <p className="text-xs text-gray-500 mb-4">Puedes deshacer los tuyos durante 24 horas.</p>
            <ul className="space-y-2">
              {awards.map(a => (
                <li key={a.id} className="flex items-start justify-between gap-3 bg-surface rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {shortName(a)} <Copihues value={`+${a.amount}`} size={16} className="font-black text-[#FF6B7A] text-sm" />
                    </p>
                    <p className="text-sm text-gray-300">{a.detail}</p>
                    <p className="text-xs text-gray-500">
                      {shortName({ first_name: a.giver_first_name, last_name: a.giver_last_name })} · {formatDate(a.created_at)}
                    </p>
                  </div>
                  {a.canUndo && (
                    <button type="button" onClick={() => undo(a.id)} className="shrink-0 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1">
                      Deshacer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
