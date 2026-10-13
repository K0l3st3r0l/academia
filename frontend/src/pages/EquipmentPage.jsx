import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCharacterCatalog, getCharacterMe, saveCharacter } from '../api/client';
import CharacterView from '../components/character/CharacterView';
import { layersToLook } from '../components/character/look';

// What the student can wear: the accessories they own (or that are free), one per zone. Saving
// changes the character everywhere it is drawn: home, islands, the opening film and the
// Academy's lobby. With ?marco=1 it is the lobby's «Equipo» window (an iframe), and tells the
// lobby when the student saved.
const ZONES = [
  { field: 'headwear', label: 'Cabeza' },
  { field: 'eyewear', label: 'Lentes' },
  { field: 'earwear', label: 'Orejas' },
  { field: 'neckwear', label: 'Cuello' },
  { field: 'backwear', label: 'Espalda' },
  { field: 'waistwear', label: 'Cintura' },
];
const NONE = 'ninguno';

export default function EquipmentPage() {
  const [params] = useSearchParams();
  const framed = params.get('marco') === '1';
  const [catalog, setCatalog] = useState(null);
  const [character, setCharacter] = useState(undefined);
  const [owned, setOwned] = useState(new Set());
  const [layers, setLayers] = useState(null);
  const [state, setState] = useState('idle');

  // Inside the lobby's wooden window the page is see-through, over the window's own parchment.
  useEffect(() => {
    if (!framed) return undefined;
    const before = document.body.style.background;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    // Keys typed here never reach the lobby: Esc closes its window from inside.
    const onKey = e => { if (e.key === 'Escape') window.parent.postMessage({ type: 'academia:cerrar' }, window.location.origin); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.background = before; window.removeEventListener('keydown', onKey); };
  }, [framed]);

  useEffect(() => {
    Promise.all([getCharacterCatalog(), getCharacterMe().catch(err => err)]).then(([catalogRes, characterRes]) => {
      setCatalog(catalogRes.data);
      const existing = characterRes?.data?.character ?? null;
      setOwned(new Set(characterRes?.data?.ownedItems ?? characterRes?.response?.data?.ownedItems ?? []));
      setCharacter(existing);
      if (existing) setLayers(existing.layers);
    });
  }, []);

  const options = useMemo(() => {
    if (!catalog) return {};
    return Object.fromEntries(ZONES.map(({ field }) => [
      field,
      (catalog[field] ?? []).filter(item => item.id === NONE || !item.price || owned.has(item.id)),
    ]));
  }, [catalog, owned]);

  const changed = character && layers && ZONES.some(({ field }) => (layers[field] || NONE) !== (character.layers[field] || NONE));

  const pick = (field, id) => {
    setLayers(prev => ({ ...prev, [field]: id }));
    setState('idle');
  };

  const save = async () => {
    setState('saving');
    try {
      const res = await saveCharacter(layers, character.name);
      const saved = res.data.character ?? { ...character, layers };
      setCharacter(saved);
      setState('saved');
      if (framed) window.parent.postMessage({ type: 'academia:equipo', layers: saved.layers }, window.location.origin);
    } catch (err) {
      setState(err.response?.data?.error || 'No pudimos guardar. Intenta de nuevo.');
    }
  };

  const page = framed ? 'p-2 text-[#3b2a1a]' : 'min-h-screen bg-surface text-white p-4';
  const panel = framed ? 'bg-[#f6e7c8] border-2 border-[#c99a52] rounded-xl' : 'bg-card rounded-2xl';
  const muted = framed ? 'text-[#6b4f2f]' : 'text-gray-400';

  if (character === undefined || !catalog) return <p className={`${page} text-center`}>Preparando tu equipo…</p>;
  if (!character) {
    return (
      <div className={`${page} text-center space-y-3`}>
        <p className="font-bold">Primero crea tu personaje: así sabremos a quién vestir.</p>
        <a href="/alumno/personaje" target="_top" className="inline-block bg-[#2f7d76] text-white font-black px-4 py-2 rounded-xl">Crear mi personaje</a>
      </div>
    );
  }

  const look = layersToLook(layers, catalog);
  return (
    <div className={page}>
      {!framed && (
        <header className="max-w-3xl mx-auto flex items-center gap-3 mb-4">
          <Link to="/alumno" className="w-11 h-11 rounded-full bg-card flex items-center justify-center font-black" aria-label="Volver al inicio">←</Link>
          <h1 className="text-2xl font-black">Equipo</h1>
        </header>
      )}
      <div className="max-w-3xl mx-auto grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] items-start">
        <div className={`${panel} p-3 flex flex-col items-center gap-2 sm:sticky sm:top-2`}>
          <CharacterView look={look} size={framed ? 300 : 340} label={character.name || 'Tu personaje'} />
          <button
            type="button"
            onClick={save}
            disabled={!changed || state === 'saving'}
            className="w-full bg-[#e0a93a] disabled:opacity-50 text-[#2b1a08] font-black px-4 py-3 rounded-xl"
          >
            {state === 'saving' ? 'Guardando…' : state === 'saved' && !changed ? '¡Guardado!' : 'Guardar'}
          </button>
          {typeof state === 'string' && !['idle', 'saving', 'saved'].includes(state) && <p className="text-sm text-red-700">{state}</p>}
          <p className={`text-xs text-center ${muted}`}>Se verá en la Academia, en las islas y en tu inicio.</p>
        </div>
        <div className="space-y-3">
          {ZONES.map(({ field, label }) => (
            <section key={field} className={`${panel} p-3`}>
              <h2 className="text-sm font-black mb-2">{label}</h2>
              <div className="grid grid-cols-4 gap-2">
                {options[field].map(item => {
                  const on = (layers[field] || NONE) === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pick(field, item.id)}
                      aria-pressed={on}
                      aria-label={`${label}: ${item.name}`}
                      className={`rounded-xl p-1 flex flex-col items-center text-[11px] leading-tight font-bold border-2 ${on ? 'border-[#e0a93a] bg-white/70' : 'border-transparent bg-black/5'}`}
                    >
                      {item.id === NONE
                        ? <span className="h-16 flex items-center text-2xl" aria-hidden="true">∅</span>
                        : <CharacterView look={{ ...look, [field]: item.id }} view={['headwear', 'eyewear', 'earwear', 'neckwear'].includes(field) ? 'portrait' : 'full'} size={64} label="" />}
                      <span className="mt-1">{item.id === NONE ? 'Nada' : item.name}</span>
                    </button>
                  );
                })}
              </div>
              {options[field].length === 1 && <p className={`text-xs mt-2 ${muted}`}>Aún no tienes nada para esta zona. Búscalo en el Puesto del Mercader.</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
