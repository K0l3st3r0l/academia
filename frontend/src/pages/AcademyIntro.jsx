import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAcademyMe, markAcademyIntroSeen, getCharacterCatalog, getCharacterMe, getPetCatalog, getPetMe } from '../api/client';
import CharacterView from '../components/character/CharacterView';
import { layersToLook } from '../components/character/look';
import PetView from '../components/pet/PetView';

// The opening film (design: wiki academia/diseno-narrativo §3). The cut lives in
// public/academia/apertura/apertura.json, written by art/apertura/montar.py: video scenes with
// their subtitles, and one live scene where the student's own character and pet receive the
// compass. It plays in full the first time; afterwards, and when replayed, it can be skipped.
const MANIFEST = '/academia/apertura/apertura.json';
const LOBBY = '/academia/';

function Subtitle({ text }) {
  if (!text) return null;
  return (
    <p className="intro-subtitle absolute inset-x-0 bottom-[6%] mx-auto w-[min(92%,900px)] text-center text-white font-bold leading-snug px-4 py-2 rounded-xl bg-black/55 text-[clamp(17px,2.6vw,30px)]" aria-live="polite">
      {text}
    </p>
  );
}

const cueAt = (cues = [], time) => cues.find(c => time >= c.start && time < c.end)?.text || '';

// Each scene is mounted with its own key, so it starts once; callbacks are read from refs.
function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function VideoScene({ scene, onEnd, onBlocked }) {
  const ref = useRef(null);
  const blocked = useLatest(onBlocked);
  const [time, setTime] = useState(0);

  useEffect(() => {
    ref.current.play().catch(() => blocked.current());
  }, [blocked]);

  const overlay = (scene.overlays || []).find(o => time >= o.start && time < o.end);
  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={ref}
        src={scene.src}
        poster={scene.poster}
        className="absolute inset-0 h-full w-full object-contain"
        playsInline
        preload="auto"
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
        onEnded={onEnd}
        onError={onEnd}
      />
      {overlay?.kind === 'title' && (
        <div className="intro-title absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <h1 className="font-black text-white drop-shadow-[0_4px_24px_rgba(0,0,0,.8)] text-[clamp(56px,11vw,150px)] leading-none">
            Academ<span className="text-gold">IA</span>
          </h1>
          {overlay.subtitle && <p className="mt-3 text-white/90 font-bold text-[clamp(16px,2.4vw,28px)] drop-shadow-lg">{overlay.subtitle}</p>}
        </div>
      )}
      <Subtitle text={cueAt(scene.cues, time)} />
    </div>
  );
}

// Drawn by the game, not the video: the student sees their own traveller and companion.
function LiveScene({ scene, hero, onEnd }) {
  const audio = useRef(null);
  const ended = useLatest(onEnd);
  const [time, setTime] = useState(0);
  // Sized by the shorter side, so a phone held upright still fits Estela, the student and the pet.
  const [unit] = useState(() => Math.min(window.innerHeight, (window.innerWidth - 40) / 0.95));

  useEffect(() => {
    const started = performance.now();
    const tick = setInterval(() => setTime((performance.now() - started) / 1000), 100);
    const end = setTimeout(() => ended.current(), scene.duration * 1000);
    audio.current?.play().catch(() => {});
    return () => { clearInterval(tick); clearTimeout(end); };
  }, [scene, ended]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <img src={scene.background} alt="" className="intro-kenburns absolute inset-0 h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      {scene.audio && <audio ref={audio} src={scene.audio} preload="auto" />}
      <div className="absolute inset-x-0 bottom-[16%] flex items-end justify-center gap-[3vw]">
        <img src={scene.estela} alt="Estela" className="intro-appear w-auto drop-shadow-2xl" style={{ height: Math.min(unit * 0.62, 520) }} />
        <div className="relative flex items-end gap-2">
          <div className="intro-hero-glow absolute -inset-10 rounded-full" />
          {hero.look && (
            <div className="intro-appear-late relative">
              <CharacterView look={hero.look} size={Math.min(unit * 0.46, 380)} label={hero.name || 'Tu personaje'} />
            </div>
          )}
          {hero.pet && (
            <div className="intro-appear-late relative">
              <PetView species={hero.pet.species} stage={hero.pet.stage} size={Math.min(unit * 0.22, 170)} catalog={hero.petCatalog} label={hero.pet.name || 'Tu compañero'} />
            </div>
          )}
          {scene.compass && <img src={scene.compass} alt="" className="intro-compass absolute left-1/2 top-1/3 w-[min(12vh,90px)]" />}
        </div>
      </div>
      <Subtitle text={cueAt(scene.cues, time)} />
    </div>
  );
}

export default function AcademyIntro() {
  const [params] = useSearchParams();
  const [manifest, setManifest] = useState(null);
  const [hero, setHero] = useState({});
  const [canSkip, setCanSkip] = useState(params.get('repetir') === '1');
  const [index, setIndex] = useState(-1);
  const [needsTap, setNeedsTap] = useState(false);
  const [failed, setFailed] = useState(false);
  const finishing = useRef(false);

  useEffect(() => {
    fetch(MANIFEST, { cache: 'no-cache' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
      .then(m => { setManifest(m); setIndex(0); })
      .catch(() => setFailed(true));
    getAcademyMe().then(res => {
      const { open, introSeenAt } = res.data.snapshot;
      if (!open) window.location.replace('/alumno');
      if (introSeenAt) setCanSkip(true);
    }).catch(() => {});
    Promise.all([
      getCharacterCatalog().then(r => r.data).catch(() => null),
      getCharacterMe().then(r => r.data.character).catch(() => null),
      getPetCatalog().then(r => r.data).catch(() => null),
      getPetMe().then(r => r.data).catch(() => null),
    ]).then(([catalog, character, petCatalog, petInfo]) => setHero({
      look: character && catalog ? layersToLook(character.layers, catalog) : null,
      name: character?.name,
      pet: petInfo?.pet ? { ...petInfo.pet, stage: petInfo.growth?.stage || 1 } : null,
      petCatalog,
    }));
  }, []);

  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    markAcademyIntroSeen().catch(() => {}).finally(() => window.location.assign(LOBBY));
  };
  const next = () => setIndex(i => {
    if (!manifest || i + 1 >= manifest.scenes.length) { finish(); return i; }
    return i + 1;
  });

  // Without the film there is nothing to watch: never keep the child waiting at a black screen.
  useEffect(() => { if (failed) finish(); }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

  const scene = manifest?.scenes[index];
  return (
    <div className="fixed inset-0 bg-black text-white select-none">
      {scene?.type === 'video' && !needsTap && <VideoScene key={index} scene={scene} onEnd={next} onBlocked={() => setNeedsTap(true)} />}
      {scene?.type === 'live' && !needsTap && <LiveScene key={index} scene={scene} hero={hero} onEnd={next} />}

      {/* Browsers only play sound after a tap when the page was opened without one. */}
      {needsTap && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-2xl font-black">Tu aventura está por comenzar</p>
          <button
            type="button"
            autoFocus
            onClick={() => setNeedsTap(false)}
            className="rounded-2xl bg-gold px-10 py-5 text-2xl font-black text-surface shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
          >
            ▶ Comenzar
          </button>
        </div>
      )}

      {canSkip && (
        <button
          type="button"
          onClick={finish}
          className="absolute right-4 top-4 rounded-xl bg-black/60 px-4 py-3 text-sm font-bold text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Saltar ⏭
        </button>
      )}
      {!manifest && !failed && <p className="absolute inset-0 flex items-center justify-center text-gray-400">Preparando la apertura…</p>}
    </div>
  );
}
