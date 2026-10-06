import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStudentToken, getStudentUser, studentLogout } from '../api/studentAuth';
import RoomCodeForm from '../components/RoomCodeForm';
import OpenRooms from '../components/OpenRooms';
import StudentLoginForm from '../components/StudentLoginForm';
import StudentAccess from '../components/StudentAccess';
import { getAuthConfig } from '../api/client';
import TeacherLoginForm from '../components/TeacherLoginForm';
import TitleBackdrop from '../components/welcome/TitleBackdrop';
import { INK } from '../components/world/WorldParts';
import { shortName } from '../utils/displayName';

const MODES = [
  {
    id: 'clase',
    label: 'Clase',
    hint: 'Con código',
    description: 'Para los juegos en la sala de clases. Toca la sala de tu curso.',
  },
  {
    id: 'alumno',
    label: 'Alumno',
    hint: 'Mi cuenta',
    description: 'Desde 3° básico, para avanzar por tu cuenta: tu personaje, tus tokens y tu progreso.',
  },
  {
    id: 'profesor',
    label: 'Profesor',
    hint: 'Anahuac',
    description: 'Entra con tu correo y contraseña de Anahuac.',
  },
];

const MODE_IDS = MODES.map(m => m.id);
const PANEL = 'bg-card/95 ring-1 ring-white/10 shadow-2xl shadow-black/50';
const outline = (px, glow) => ({
  textShadow: `-${px}px -${px}px 0 ${INK}, ${px}px -${px}px 0 ${INK}, -${px}px ${px}px 0 ${INK}, ${px}px ${px}px 0 ${INK}, 0 ${px * 2}px 0 ${INK}${glow ? `, ${glow}` : ''}`,
});
const TITLE_STYLE = outline(3, '0 0 32px rgba(155, 111, 240, 0.85)');
const HEADING_STYLE = outline(2);
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
    <div className={`${PANEL} rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
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
  const [authConfig, setAuthConfig] = useState(null);

  useEffect(() => {
    getAuthConfig()
      .then(res => setAuthConfig(res.data))
      .catch(() => setAuthConfig({ studentEmailAccounts: false }));
  }, []);

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
    <div className="relative isolate min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <TitleBackdrop />
      <div className="w-full max-w-sm">
        <header className="text-center mb-8">
          <h1 className="title-float text-6xl font-black tracking-tight text-white mb-3" style={TITLE_STYLE}>
            Academ<span className="text-gold">IA</span>
          </h1>
          <p className="inline-block px-3 py-1 rounded-full text-sm font-bold text-gray-200" style={{ background: `${INK}B3` }}>
            Plataforma educativa gamificada
          </p>
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

        <h2 id="welcome-modes-label" className="text-center text-white font-black text-lg mb-3" style={HEADING_STYLE}>
          ¿Cómo quieres entrar?
        </h2>

        <div
          role="tablist"
          aria-labelledby="welcome-modes-label"
          className={`grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl ${PANEL}`}
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
          className={`rounded-2xl p-6 mt-3 ${PANEL}`}
        >
          <p className="text-gray-400 text-sm text-center mb-5">{current.description}</p>
          {mode === 'clase' && (
            <>
              <OpenRooms />
              {/* No autofocus: the tablet keyboard would cover the room list. */}
              <RoomCodeForm />
            </>
          )}
          {mode === 'alumno' && (
            !authConfig ? (
              <p className="text-gray-500 text-center">Cargando...</p>
            ) : authConfig.studentEmailAccounts ? (
              <StudentAccess domain={authConfig.institutionalDomain} autoFocus={focusForm} />
            ) : (
              <StudentLoginForm autoFocus={focusForm} />
            )
          )}
          {mode === 'profesor' && <TeacherLoginForm autoFocus={focusForm} />}
        </section>
      </div>
    </div>
  );
}
