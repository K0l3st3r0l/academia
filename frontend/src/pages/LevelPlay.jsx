import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { answerLevel, askCompanion, startLevel } from '../api/client';
import PetView from '../components/pet/PetView';
import { Tokens } from '../components/TokenCoin';
import { INK, Stars } from '../components/world/WorldParts';
import useCompanions from '../components/world/useCompanions';
import { OUTLINE, celebrateKey } from './WorldMap';

const SKY = 'linear-gradient(to bottom, #267EFB 0%, #9CC2FB 60%, #CAD1FC 100%)';
const BADGES = ['#6C3CE1', '#F5C842', '#14B8A6', '#F87171'];
const CHUNKY = { borderColor: INK, boxShadow: `0 5px 0 ${INK}` };
const TITLES = ['¡Casi!', '¡Lo lograste!', '¡Muy bien!', '¡Perfecto!'];

function ProgressBar({ results, total }) {
  return (
    <div className="flex-1 flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={results.length}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-3.5 flex-1 rounded-full border-2"
          style={{ borderColor: INK, background: i < results.length ? (results[i] ? '#22C55E' : '#EF4444') : '#FFFFFF' }}
        />
      ))}
    </div>
  );
}

function Option({ text, letter, color, state, onPick }) {
  const styles = {
    idle: { background: '#FFFFFF', color: INK },
    right: { background: '#22C55E', color: '#FFFFFF' },
    wrong: { background: '#EF4444', color: '#FFFFFF' },
    dim: { background: '#FFFFFF', color: INK, opacity: 0.45 },
    discarded: { background: '#FFFFFF', color: INK, opacity: 0.35, textDecoration: 'line-through' },
  };
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={state !== 'idle'}
      className={`w-full flex items-center gap-3 text-left rounded-2xl border-4 px-3 py-3 font-bold text-lg transition-transform ${state === 'idle' ? 'active:translate-y-1 hover:brightness-95' : ''} ${state === 'wrong' ? 'animate-shake' : ''}`}
      style={{ ...CHUNKY, ...styles[state] }}
    >
      <span className="shrink-0 w-9 h-9 rounded-xl border-[3px] flex items-center justify-center font-black text-white" style={{ background: color, borderColor: INK }}>
        {letter}
      </span>
      <span className="min-w-0 break-words">{text}</span>
    </button>
  );
}

function Feedback({ feedback, last, onNext }) {
  const nextRef = useRef(null);
  useEffect(() => {
    nextRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    nextRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="bg-white rounded-3xl border-4 p-4 animate-pop" style={{ ...CHUNKY, color: INK }} role="status">
      {feedback.correct ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-black text-correct">¡Correcto!</p>
          {feedback.tokens > 0 && (
            <span className="relative">
              <Tokens value={`+${feedback.tokens}`} size={26} className="font-black text-2xl" />
              <span className="absolute left-0 top-0 world-rise" aria-hidden="true"><Tokens value={`+${feedback.tokens}`} size={26} className="font-black text-2xl text-gold" /></span>
            </span>
          )}
        </div>
      ) : (
        <>
          <p className="text-2xl font-black text-wrong">No era esa</p>
          <p className="mt-1">La respuesta es: <strong>{feedback.correctAnswer}</strong></p>
          {feedback.note && (
            <p className="mt-2 rounded-xl px-3 py-2 font-semibold" style={{ background: '#FEF3C7' }}>Ojo: {feedback.note}</p>
          )}
        </>
      )}
      {feedback.alreadyPaid && (
        <p className="text-sm text-gray-600 mt-1">Ya la habías acertado antes, así que esta no suma tokens.</p>
      )}
      {feedback.explanation && <p className="mt-2 text-gray-700">{feedback.explanation}</p>}
      <button
        ref={nextRef}
        type="button"
        onClick={onNext}
        className="mt-4 w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-2xl text-lg border-4 active:translate-y-0.5"
        style={CHUNKY}
      >
        {last ? 'Ver resultado' : 'Siguiente'}
      </button>
    </div>
  );
}

function Result({ finished, level, pet, petCatalog, onMap, onReplay }) {
  const record = finished.stars > finished.previousStars && finished.previousStars > 0;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-3xl border-4 p-6 text-center animate-pop" style={{ ...CHUNKY, color: INK }}>
        <p className="text-sm font-semibold text-gray-500">{level.label}</p>
        <h1 className="text-4xl font-black mt-1">{TITLES[finished.stars]}</h1>
        <Stars value={finished.stars} size={54} pop className="my-4" gap={6} />
        <p className="text-lg font-bold">Acertaste {finished.correct} de {finished.total}</p>
        {finished.tokens > 0 && (
          <p className="mt-3"><Tokens value={`+${finished.tokens}`} size={40} className="font-black text-4xl" /></p>
        )}
        {finished.bonus > 0 && <p className="text-sm text-gray-600">Incluye +{finished.bonus} por estrellas nuevas</p>}
        {record && <p className="mt-2 font-black text-brand">¡Mejoraste tu récord!</p>}
        {finished.stars === 0 && (
          <p className="mt-3 text-gray-700">Acierta al menos la mitad para abrir el siguiente nivel. ¡Inténtalo otra vez!</p>
        )}
        {pet && (
          <div className="flex justify-center -mb-2 mt-2">
            <PetView species={pet.species} stage={pet.stage} size={110} catalog={petCatalog} label={pet.name} hop={finished.stars > 0} />
          </div>
        )}
        <div className="mt-5 space-y-3">
          <button type="button" onClick={onMap} autoFocus className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-2xl text-lg border-4 active:translate-y-0.5" style={CHUNKY}>
            Volver al mapa
          </button>
          <button type="button" onClick={onReplay} className="w-full bg-white font-black py-3 rounded-2xl text-lg border-4 active:translate-y-0.5" style={{ ...CHUNKY, color: INK }}>
            Jugar de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}

function ExitDialog({ onStay, onLeave }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <div className="w-full max-w-xs bg-white rounded-3xl border-4 p-5 text-center animate-pop" style={{ ...CHUNKY, color: INK }}>
        <p id="exit-title" className="text-xl font-black">¿Salir del nivel?</p>
        <p className="text-gray-700 mt-2">Tus respuestas y tokens se guardan, pero el nivel no queda terminado.</p>
        <div className="mt-4 space-y-2">
          <button type="button" onClick={onStay} autoFocus className="w-full bg-brand text-white font-black py-3 rounded-2xl border-4" style={CHUNKY}>Seguir jugando</button>
          <button type="button" onClick={onLeave} className="w-full font-bold py-2 text-gray-600">Salir</button>
        </div>
      </div>
    </div>
  );
}

export default function LevelPlay() {
  const { subject, key } = useParams();
  const navigate = useNavigate();
  const { pet, petCatalog } = useCompanions();
  const [run, setRun] = useState(0);
  const [play, setPlay] = useState(null);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [results, setResults] = useState([]);
  const [earned, setEarned] = useState(0);
  const [help, setHelp] = useState(null);
  const [helpUsed, setHelpUsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [exiting, setExiting] = useState(false);
  const shownAt = useRef(Date.now());
  const toMap = () => navigate(`/alumno/mundo/${subject}`);

  useEffect(() => {
    let alive = true;
    setPlay(null); setError(null); setIndex(0); setPicked(null); setFeedback(null); setResults([]);
    setEarned(0); setHelp(null); setHelpUsed(false); setFinished(null); setShowResult(false);
    startLevel(subject, key)
      .then(res => { if (alive) { setPlay(res.data); shownAt.current = Date.now(); } })
      .catch(err => alive && setError(err.response?.data?.error ?? 'No se pudo abrir el nivel.'));
    return () => { alive = false; };
  }, [subject, key, run]);

  const question = play?.questions[index];

  const pick = async option => {
    if (sending || feedback) return;
    setSending(true);
    setPicked(option);
    try {
      const { data } = await answerLevel(play.attemptId, index, option, Date.now() - shownAt.current);
      setFeedback(data);
      setResults(r => [...r, data.correct]);
      setEarned(e => e + data.tokens);
      if (data.finished) {
        setFinished(data.finished);
        if (data.finished.stars > data.finished.previousStars) {
          try { sessionStorage.setItem(celebrateKey(subject), key); } catch { /* no celebration then */ }
        }
      }
    } catch (err) {
      setPicked(null);
      setError(err.response?.data?.error ?? 'No se pudo guardar tu respuesta.');
    } finally {
      setSending(false);
    }
  };

  const next = () => {
    if (finished) { setShowResult(true); return; }
    setIndex(i => i + 1);
    setPicked(null);
    setFeedback(null);
    shownAt.current = Date.now();
  };

  const askHelp = async () => {
    setHelpUsed(true);
    try {
      const { data } = await askCompanion(play.attemptId, index);
      setHelp({ ...data, index });
    } catch {
      setHelp({ clue: 'Ahora no puedo ayudarte. ¡Tú puedes!', index });
    }
  };

  if (error && !play) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: SKY }}>
        <p className="text-2xl font-black text-white" style={OUTLINE}>{error}</p>
        <Link to={`/alumno/mundo/${subject}`} className="bg-white font-black px-5 py-3 rounded-2xl border-4" style={{ ...CHUNKY, color: INK }}>Volver al mapa</Link>
      </div>
    );
  }
  if (!play) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: SKY }}>
        <p className="text-2xl font-black text-white" style={OUTLINE}>Preparando tu nivel…</p>
      </div>
    );
  }

  const optionState = option => {
    if (!feedback) return help?.index === index && help.discard === option ? 'discarded' : 'idle';
    if (option === feedback.correctAnswer) return 'right';
    if (option === picked) return 'wrong';
    return 'dim';
  };
  const clueHere = help && help.index === index && help.clue;
  const discardHere = help && help.index === index && help.discard;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: SKY }}>
      {showResult ? (
        <Result finished={finished} level={play.level} pet={pet} petCatalog={petCatalog} onMap={toMap} onReplay={() => setRun(r => r + 1)} />
      ) : (
        <main className="w-full max-w-[560px] mx-auto flex-1 flex flex-col px-4 pt-3 pb-6 gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (results.length ? setExiting(true) : toMap())}
              aria-label="Salir del nivel"
              className="w-10 h-10 shrink-0 rounded-full bg-white border-4 font-black text-xl leading-none"
              style={{ borderColor: INK, color: INK }}
            >
              ×
            </button>
            <ProgressBar results={results} total={play.questions.length} />
            <span className="shrink-0 px-2.5 py-1 rounded-full" style={{ background: `${INK}D9` }}>
              <Tokens value={earned} size={18} />
            </span>
          </div>
          <p className="text-white font-black text-center" style={OUTLINE}>
            {play.level.label}
          </p>

          <div className="bg-white rounded-3xl border-4 p-5 text-xl font-bold leading-snug" style={{ ...CHUNKY, color: INK }}>
            <p className="text-sm font-semibold text-gray-500 mb-1">Pregunta {index + 1} de {play.questions.length}</p>
            <p>{question.text}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {question.options.map((option, i) => (
              <Option key={option} text={option} letter={'ABCD'[i]} color={BADGES[i]} state={optionState(option)} onPick={() => pick(option)} />
            ))}
          </div>

          {error && <p className="text-white font-bold text-center" style={OUTLINE}>{error}</p>}
          {feedback && <Feedback feedback={feedback} last={!!finished} onNext={next} />}

          {!feedback && (
            <div className="mt-auto flex items-end gap-2">
              {pet && (
                <PetView key={`pet-${index}`} species={pet.species} stage={pet.stage} size={84} catalog={petCatalog} label={pet.name} hop={!!help && help.index === index} />
              )}
              {clueHere || discardHere ? (
                <p className="mb-6 bg-white rounded-2xl border-4 px-3 py-2 font-bold max-w-[260px]" style={{ borderColor: INK, color: INK }} role="status">
                  {clueHere ? help.clue : `«${help.discard}» no es. ¡Elige entre las otras!`}
                </p>
              ) : !helpUsed ? (
                <button type="button" onClick={askHelp} className="mb-6 bg-white rounded-2xl border-4 px-3 py-2 font-black hover:brightness-95" style={{ borderColor: INK, color: INK }}>
                  {pet ? `${pet.name}: ¿te ayudo?` : 'Pedir una ayuda'}
                </button>
              ) : null}
            </div>
          )}
        </main>
      )}
      {exiting && <ExitDialog onStay={() => setExiting(false)} onLeave={toMap} />}
    </div>
  );
}
