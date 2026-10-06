import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getWorldMap } from '../api/client';
import { getStudentUser } from '../api/studentAuth';
import CharacterView from '../components/character/CharacterView';
import PetView from '../components/pet/PetView';
import { Tokens } from '../components/TokenCoin';
import MapNode from '../components/world/MapNode';
import { Cloud, Condor, INK, LockIcon, Sparkle, Star, Stars } from '../components/world/WorldParts';
import useCompanions from '../components/world/useCompanions';

export const SUBJECT_NAMES = {
  matematica: 'Matemática', lenguaje: 'Lenguaje', ciencias: 'Ciencias', historia: 'Historia', ingles: 'Inglés',
};
export const OUTLINE = {
  textShadow: `-2px -2px 0 ${INK}, 2px -2px 0 ${INK}, -2px 2px 0 ${INK}, 2px 2px 0 ${INK}, 0 4px 0 ${INK}`,
};
const ENTRY = 'entrada';
const STEP_MS = 850;

// Where the avatar was last seen on this map, per student: on return it walks from there.
const positionKey = subject => `academia_world_${getStudentUser()?.id ?? 'x'}_${subject}`;
export const celebrateKey = subject => `academia_world_celebrate_${subject}`;

function readStorage(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function writeStorage(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Without storage the avatar simply appears at its level.
  }
}

// The path an avatar can walk on one island: the dock, every level, the challenge.
function pathOf(island) {
  return [
    { key: ENTRY, at: island.entry },
    ...island.levels.map(l => ({ key: l.key, at: l.at })),
    { key: island.challenge.key, at: island.challenge.at },
  ];
}

// Where the avatar and the pet stand next to a pad, in island pixels: on the side (left or right)
// that keeps them farthest from the other levels and their stars, so they never cover one.
const AVATAR_DX = 105;
const PET_DX = 190;
function standAt([x, y], island) {
  const others = [...island.levels.map(l => l.at), island.challenge.at]
    .filter(([ox, oy]) => ox !== x || oy !== y)
    .map(([ox, oy]) => [ox, oy - 30]);
  const clearance = side => {
    const spots = [[x + side * AVATAR_DX, y - 80], [x + side * PET_DX, y - 20]];
    if (spots.some(([sx]) => sx < 90 || sx > island.width - 90)) return -1;
    return Math.min(...spots.flatMap(([sx, sy]) => others.map(([ox, oy]) => Math.hypot(sx - ox, sy - oy))));
  };
  const side = clearance(1) > clearance(-1) ? 1 : -1;
  return { avatar: [x + side * AVATAR_DX, y + 16], pet: [x + side * PET_DX, y + 30] };
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function ComingUnit({ unit, ejes }) {
  return (
    <section className="relative h-48 flex items-center justify-center overflow-hidden" aria-label={`Unidad ${unit}, muy pronto`}>
      <div className="absolute -left-10 top-6 world-drift opacity-90"><Cloud width={220} /></div>
      <div className="absolute -right-12 top-20 world-drift opacity-95" style={{ animationDelay: '-9s' }}><Cloud width={250} /></div>
      <div className="absolute left-1/4 bottom-0 world-drift opacity-80" style={{ animationDelay: '-15s' }}><Cloud width={200} /></div>
      <div className="relative z-10 text-center px-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-white border-4 flex items-center justify-center" style={{ borderColor: INK }}>
          <LockIcon size={26} />
        </div>
        <p className="mt-2 text-2xl font-black text-white" style={OUTLINE}>Unidad {unit}</p>
        <p className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-sm font-bold text-white" style={{ background: `${INK}99` }}>{ejes.join(' · ')}</p>
        <br />
        <span className="inline-block mt-2 px-3 py-0.5 rounded-full text-xs font-black text-white" style={{ background: INK }}>
          Muy pronto
        </span>
      </div>
    </section>
  );
}

function LevelSheet({ level, number, onClose, onPlay }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const playable = level.state === 'open' || level.state === 'done';
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-title"
        onClick={e => e.stopPropagation()}
        className="world-sheet w-full max-w-[520px] bg-card text-white rounded-t-3xl border-t-4 px-5 pt-4 pb-7 shadow-2xl"
        style={{ borderColor: INK }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-gray-400 text-sm font-semibold">
            {level.challenge ? 'Desafío de la isla' : `Nivel ${number}`}
          </p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-white text-2xl leading-none -mt-1 px-2">
            ×
          </button>
        </div>
        <h2 id="level-title" className="text-2xl font-black leading-tight mt-1">{level.label}</h2>
        {level.challenge && level.state !== 'preparing' && (
          <p className="text-gray-300 text-sm mt-1">Una pregunta de cada nivel de la isla.</p>
        )}

        {playable && (
          <div className="flex items-center justify-between mt-4 bg-surface rounded-2xl px-4 py-3">
            <div>
              <p className="text-gray-400 text-xs">{level.stars ? 'Tu mejor resultado' : 'Aún sin estrellas'}</p>
              <Stars value={level.stars} size={22} />
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">Cada acierto</p>
              <Tokens value={`+${level.pay}`} size={22} className="font-black text-gold text-xl" />
            </div>
          </div>
        )}
        {playable && level.pay >= 7 && (
          <p className="text-gold text-sm font-semibold mt-2">Aquí estás aprendiendo: este nivel paga más.</p>
        )}
        {level.state === 'locked' && (
          <p className="text-gray-300 mt-4">
            {level.challenge
              ? 'Gana al menos una estrella en todos los niveles de la isla para abrir el desafío.'
              : 'Gana al menos una estrella en el nivel anterior para abrir este.'}
          </p>
        )}
        {level.state === 'preparing' && (
          <p className="text-gray-300 mt-4">
            Tus profesores están preparando las preguntas de este nivel. Mientras, puedes seguir con el siguiente.
          </p>
        )}

        {playable && (
          <button
            type="button"
            onClick={onPlay}
            className="mt-5 w-full bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-2xl text-xl border-4 transition-transform active:translate-y-0.5"
            style={{ borderColor: INK, boxShadow: `0 5px 0 ${INK}` }}
          >
            {level.stars ? 'Jugar de nuevo' : '¡Jugar!'}
          </button>
        )}
      </div>
    </div>
  );
}

function Island({ island, current, celebrate, avatar, companions, onSelect, currentRef }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const pct = ([x, y]) => ({ left: `${(x / island.width) * 100}%`, top: `${(y / island.height) * 100}%` });
  const levels = [...island.levels.map((l, i) => ({ ...l, number: i + 1 })), { ...island.challenge, challenge: true }];
  const avatarHeight = width * 0.17;
  const stand = avatar && standAt(avatar.at, island);
  const transition = `left ${STEP_MS}ms ease-in-out, top ${STEP_MS}ms ease-in-out`;

  return (
    <section
      className="relative"
      style={{ background: 'linear-gradient(to bottom, #267EFB 0%, #7FB0FB 45%, #CAD1FC 100%)' }}
      aria-label={`Unidad ${island.unit}: ${island.name}`}
    >
      <div className="hidden md:block absolute left-[6%] top-[30%] world-drift"><Cloud width={260} /></div>
      <div className="hidden md:block absolute right-[5%] top-[62%] world-drift" style={{ animationDelay: '-11s' }}><Cloud width={300} /></div>
      <div ref={ref} className="relative mx-auto w-full max-w-[520px] md:max-w-[600px] world-float" style={{ aspectRatio: `${island.width} / ${island.height}` }}>
        <img
          src={`/world/${island.image}-1024.webp`}
          srcSet={`/world/${island.image}-640.webp 640w, /world/${island.image}-1024.webp 1024w`}
          sizes="(max-width: 520px) 100vw, 600px"
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full select-none world-island-art"
        />
        {island.sparkles.map(([x, y], i) => (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={pct([x, y])}>
            <Sparkle size={Math.max(14, width * 0.045)} delay={i * 0.7} />
          </div>
        ))}
        {levels.map(level => (
          <MapNode
            key={level.key}
            level={level}
            number={level.number}
            island={island}
            current={level.key === current}
            celebrate={level.key === celebrate}
            onSelect={onSelect}
            buttonRef={level.key === current ? currentRef : undefined}
          />
        ))}
        {avatar && width > 0 && (
          <>
            {companions.pet && (
              <div
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
                style={{ ...pct(stand.pet), transition, transitionDelay: '120ms', zIndex: 7 }}
              >
                <div className={avatar.walking ? 'world-walk' : ''}>
                  <PetView species={companions.pet.species} stage={companions.pet.stage} size={width * 0.1}
                    catalog={companions.petCatalog} label={companions.pet.name} idle={!avatar.walking} />
                </div>
              </div>
            )}
            {companions.look && (
              <div
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
                style={{ ...pct(stand.avatar), transition, zIndex: 8 }}
              >
                <div className={avatar.walking ? 'world-walk' : 'animate-breathe'}>
                  <CharacterView look={companions.look} size={avatarHeight} label="Tu personaje" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default function WorldMap() {
  const { subject = 'matematica' } = useParams();
  const navigate = useNavigate();
  const companions = useCompanions();
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [celebrate] = useState(() => readStorage(sessionStorage, celebrateKey(subject)));
  const currentRef = useRef(null);
  const scrolled = useRef(false);

  useEffect(() => {
    getWorldMap(subject)
      .then(res => setMap(res.data))
      .catch(err => setError(err.response?.status === 404 ? 'Tu curso aún no tiene este mapa.' : 'No se pudo cargar el mapa.'));
    writeStorage(sessionStorage, celebrateKey(subject), null);
  }, [subject]);

  // The avatar walks pad by pad from where it was last time to the level to play now.
  useEffect(() => {
    if (!map) return undefined;
    const island = map.islands.find(i => pathOf(i).some(p => p.key === map.current)) ?? map.islands[0];
    if (!island) return undefined;
    const path = pathOf(island);
    const to = Math.max(0, path.findIndex(p => p.key === map.current));
    const seen = path.findIndex(p => p.key === readStorage(localStorage, positionKey(subject)));
    const from = seen === -1 ? 0 : Math.min(seen, to);
    writeStorage(localStorage, positionKey(subject), path[to].key);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let step = reduced ? to : from;
    setAvatar({ unit: island.unit, at: path[step].at, walking: false });
    if (step === to) return undefined;
    const timers = [];
    const walk = () => {
      step += 1;
      setAvatar({ unit: island.unit, at: path[step].at, walking: true });
      if (step < to) timers.push(setTimeout(walk, STEP_MS));
      else timers.push(setTimeout(() => setAvatar(a => ({ ...a, walking: false })), STEP_MS));
    };
    timers.push(setTimeout(walk, 700));
    return () => timers.forEach(clearTimeout);
  }, [map, subject]);

  useEffect(() => {
    if (!map || !avatar || scrolled.current) return;
    scrolled.current = true;
    requestAnimationFrame(() => currentRef.current?.scrollIntoView({ block: 'center' }));
  }, [map, avatar]);

  if (error || !map) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" style={{ background: 'linear-gradient(#1747B0, #267EFB)' }}>
        <p className="text-2xl font-black text-white" style={OUTLINE}>{error ?? 'Cargando el mapa…'}</p>
        {error && <Link to="/alumno" className="bg-white text-surface font-black px-5 py-2 rounded-xl">Volver</Link>}
      </div>
    );
  }

  const numberOf = key => map.islands.flatMap(i => i.levels).findIndex(l => l.key === key) + 1;

  return (
    <div className="min-h-screen relative overflow-x-clip" style={{ background: '#CAD1FC' }}>
      <header className="sticky top-0 z-30 px-3 pt-3 pb-2 flex items-center gap-2 justify-between max-w-[720px] mx-auto">
        <button
          type="button"
          onClick={() => navigate('/alumno')}
          aria-label="Volver al inicio"
          className="w-11 h-11 rounded-full bg-white border-4 flex items-center justify-center font-black text-xl"
          style={{ borderColor: INK, color: INK, boxShadow: `0 3px 0 ${INK}` }}
        >
          ←
        </button>
        <h1 className="px-4 py-1.5 rounded-full text-white font-black text-lg truncate" style={{ background: `${INK}D9` }}>
          {SUBJECT_NAMES[subject] ?? subject}
        </h1>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-white font-black tabular-nums" style={{ background: `${INK}D9` }}>
            <Star filled size={18} />
            {map.stars.earned}
            <span className="sr-only"> de {map.stars.max} estrellas</span>
          </span>
          <span className="px-2.5 py-1.5 rounded-full" style={{ background: `${INK}D9` }}>
            <Tokens value={map.tokens} size={18} />
          </span>
        </div>
      </header>

      <div className="-mt-[60px]" style={{ background: 'linear-gradient(to bottom, #123E9C 0%, #267EFB 100%)' }}>
        <div className="h-16" />
        <div className="absolute top-24 left-0 world-glide pointer-events-none"><Condor width={58} /></div>
        {[...map.comingUnits].reverse().map(u => <ComingUnit key={u.unit} {...u} />)}
      </div>

      {[...map.islands].reverse().map(island => (
        <Island
          key={island.unit}
          island={island}
          current={map.current}
          celebrate={celebrate}
          avatar={avatar?.unit === island.unit ? avatar : null}
          companions={companions}
          onSelect={setSelected}
          currentRef={currentRef}
        />
      ))}

      <p className="text-center text-sm font-bold py-5" style={{ color: INK }}>
        Toca un nivel para jugar
      </p>

      {selected && (
        <LevelSheet
          level={selected}
          number={numberOf(selected.key)}
          onClose={() => setSelected(null)}
          onPlay={() => navigate(`/alumno/mundo/${subject}/${selected.key}`)}
        />
      )}
    </div>
  );
}
