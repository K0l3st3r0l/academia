import { useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStudentToken, getStudentUser, studentLogout } from '../api/studentAuth';
import RoomCodeForm from '../components/RoomCodeForm';
import StudentLoginForm from '../components/StudentLoginForm';
import TeacherLoginForm from '../components/TeacherLoginForm';
import { shortName } from '../utils/displayName';

const MODES = [
  {
    id: 'clase',
    label: 'Clase',
    hint: 'Con código',
    description: 'Para los juegos en la sala de clases. Escribe el código que muestra tu profe.',
  },
  {
    id: 'alumno',
    label: 'Alumno',
    hint: 'RUT y PIN',
    description: 'Para avanzar por tu cuenta: tu personaje, tus tokens y tu progreso.',
  },
  {
    id: 'profesor',
    label: 'Profesor',
    hint: 'Correo',
    description: 'Entra con tu correo y contraseña de Anahuac.',
  },
];

const MODE_IDS = MODES.map(m => m.id);
const LAST_MODE_KEY = 'academia_welcome_mode';

// A shared classroom tablet reopens on "Clase"; a teacher's laptop, on "Profesor".
function readLastMode() {
  try {
    return localStorage.getItem(LAST_MODE_KEY);
  } catch {
    return null;
  }
}

function saveLastMode(mode) {
  try {
    localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    // Storage blocked: the page still works, it just won't remember the tab.
  }
}

function initialMode(param) {
  if (MODE_IDS.includes(param)) return param;
  const last = readLastMode();
  return MODE_IDS.includes(last) ? last : 'clase';
}

function OpenSession({ name, role, homePath, homeLabel, onLogout }) {
  return (
    <div className="bg-card rounded-2xl px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-sm text-gray-300">
        Sesión abierta: <span className="font-bold text-white">{name}</span>{' '}
        <span className="text-gray-500">({role})</span>
      </p>
      <div className="flex items-center gap-3">
        <button onClick={onLogout} className="text-gray-500 hover:text-gray-300 text-sm">
          Cerrar sesión
        </button>
        <Link
          to={homePath}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(() => initialMode(searchParams.get('modo')));
  // Focusing on first paint would pop the tablet keyboard over the three options,
  // and arrow-key navigation must keep focus on the tabs.
  const [focusForm, setFocusForm] = useState(false);
  const tabRefs = useRef({});
  const { user, isTeacher, logout } = useAuth();
  const [student, setStudent] = useState(() => (getStudentToken() ? getStudentUser() : null));

  const selectMode = (id, { focusTab = false } = {}) => {
    setMode(id);
    setFocusForm(!focusTab);
    saveLastMode(id);
    if (focusTab) tabRefs.current[id]?.focus();
  };

  const handleTabKeyDown = (e) => {
    const index = MODE_IDS.indexOf(mode);
    const moves = {
      ArrowRight: (index + 1) % MODE_IDS.length,
      ArrowLeft: (index - 1 + MODE_IDS.length) % MODE_IDS.length,
      Home: 0,
      End: MODE_IDS.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    selectMode(MODE_IDS[moves[e.key]], { focusTab: true });
  };

  const handleStudentLogout = () => {
    studentLogout();
    setStudent(null);
  };

  const current = MODES.find(m => m.id === mode);
  const hasSession = (user && isTeacher) || student;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <header className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-tight text-brand-light mb-1">
            Academ<span className="text-gold">IA</span>
          </h1>
          <p className="text-gray-400 text-sm">Plataforma educativa gamificada</p>
        </header>

        {hasSession && (
          <div className="space-y-2 mb-6">
            {user && isTeacher && (
              <OpenSession
                name={shortName(user)}
                role="profesor"
                homePath="/teacher"
                homeLabel="Ir a mi panel"
                onLogout={logout}
              />
            )}
            {student && (
              <OpenSession
                name={shortName(student)}
                role="alumno"
                homePath="/alumno"
                homeLabel="Ir a mi inicio"
                onLogout={handleStudentLogout}
              />
            )}
          </div>
        )}

        <h2 id="welcome-modes-label" className="text-center text-gray-300 font-bold mb-3">
          ¿Cómo quieres entrar?
        </h2>

        <div
          role="tablist"
          aria-labelledby="welcome-modes-label"
          className="grid grid-cols-3 gap-1.5 bg-card p-1.5 rounded-2xl shadow-xl"
        >
          {MODES.map(m => {
            const selected = m.id === mode;
            return (
              <button
                key={m.id}
                ref={el => { tabRefs.current[m.id] = el; }}
                type="button"
                role="tab"
                id={`welcome-tab-${m.id}`}
                aria-selected={selected}
                aria-controls="welcome-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => selectMode(m.id)}
                onKeyDown={handleTabKeyDown}
                className={`rounded-xl px-1 py-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light ${
                  selected ? 'bg-brand text-white' : 'text-gray-400 hover:text-white hover:bg-surface'
                }`}
              >
                <span className="block font-black text-base leading-tight">{m.label}</span>
                <span className={`block text-xs mt-0.5 ${selected ? 'text-white/80' : 'text-gray-500'}`}>
                  {m.hint}
                </span>
              </button>
            );
          })}
        </div>

        <section
          role="tabpanel"
          id="welcome-panel"
          aria-labelledby={`welcome-tab-${mode}`}
          className="bg-card rounded-2xl p-6 shadow-xl mt-3"
        >
          <p className="text-gray-400 text-sm text-center mb-5">{current.description}</p>
          {mode === 'clase' && <RoomCodeForm autoFocus={focusForm} />}
          {mode === 'alumno' && <StudentLoginForm autoFocus={focusForm} />}
          {mode === 'profesor' && <TeacherLoginForm autoFocus={focusForm} />}
        </section>
      </div>
    </div>
  );
}
