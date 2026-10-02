import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCharacterCatalog, getCharacterMe, getStudentMe, saveCharacter, renameCharacter, buyCharacterItem,
} from '../api/client';
import CharacterView from '../components/character/CharacterView';
import { layersToLook, defaultLayers } from '../components/character/look';

// Each tab groups catalog lists; parts preview the character, colors are swatches.
const TABS = [
  { key: 'piel', label: 'Piel', sections: [
    { field: 'skinTone', list: 'skinTones', label: 'Tono de piel', type: 'color' },
  ] },
  { key: 'pelo', label: 'Pelo', sections: [
    { field: 'hairStyle', list: 'hairStyles', label: 'Peinado', type: 'part', view: 'portrait', size: 96 },
    { field: 'hairColor', list: 'hairColors', label: 'Color de pelo', type: 'color' },
  ] },
  { key: 'cara', label: 'Cara', sections: [
    { field: 'eyes', list: 'eyes', label: 'Ojos', type: 'part', view: 'face', size: 72 },
    { field: 'eyeColor', list: 'eyeColors', label: 'Color de ojos', type: 'color' },
    { field: 'brows', list: 'brows', label: 'Cejas', type: 'part', view: 'face', size: 72 },
    { field: 'nose', list: 'noses', label: 'Nariz', type: 'part', view: 'face', size: 72 },
    { field: 'mouth', list: 'mouths', label: 'Boca', type: 'part', view: 'face', size: 72 },
  ] },
  { key: 'ropa', label: 'Ropa', sections: [
    { field: 'top', list: 'tops', label: 'Arriba', type: 'part', view: 'full', size: 120 },
    { field: 'topColor', list: 'topColors', label: 'Color de arriba', type: 'color' },
    { field: 'bottom', list: 'bottoms', label: 'Abajo', type: 'part', view: 'full', size: 120 },
    { field: 'bottomColor', list: 'bottomColors', label: 'Color de abajo', type: 'color' },
    { field: 'shoes', list: 'shoes', label: 'Calzado', type: 'part', view: 'full', size: 120 },
    { field: 'shoeColor', list: 'shoeColors', label: 'Color del calzado', type: 'color' },
  ] },
  { key: 'accesorios', label: 'Accesorios', sections: [
    { field: 'headwear', list: 'headwear', label: 'Cabeza', type: 'part', view: 'portrait', size: 96 },
    { field: 'eyewear', list: 'eyewear', label: 'Lentes', type: 'part', view: 'portrait', size: 96 },
    { field: 'earwear', list: 'earwear', label: 'Orejas', type: 'part', view: 'portrait', size: 96 },
    { field: 'neckwear', list: 'neckwear', label: 'Cuello', type: 'part', view: 'portrait', size: 96 },
    { field: 'backwear', list: 'backwear', label: 'Espalda', type: 'part', view: 'full', size: 120 },
  ] },
];
const ALL_SECTIONS = TABS.flatMap(t => t.sections);

const NAME_STATUS = {
  pending: { text: 'En revisión', className: 'text-gray-400' },
  approved: { text: 'Aprobado', className: 'text-correct' },
  rejected: { text: 'No fue aprobado: elige otro, es gratis', className: 'text-wrong' },
};

const priceOf = item => item?.price ?? 0;

function Tokens({ value }) {
  return <span className="font-black text-gold tabular-nums">🪙 {value}</span>;
}

function PriceTag({ item, owned }) {
  if (!priceOf(item)) return null;
  const locked = !owned.has(item.id);
  return (
    <span className={`absolute -top-2 -right-2 text-[10px] font-black px-1.5 py-0.5 rounded-full ${locked ? 'bg-gold text-black' : 'bg-correct text-white'}`}>
      {locked ? `🔒 ${priceOf(item)}` : 'Tuyo'}
    </span>
  );
}

const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null;
const subscribeNarrow = cb => { narrowQuery?.addEventListener('change', cb); return () => narrowQuery?.removeEventListener('change', cb); };
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => narrowQuery?.matches ?? false);

function PartOptions({ section, catalog, layers, owned, onPick }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(section.size * (section.view === 'face' ? 1.33 : section.view === 'portrait' ? 0.97 : 0.67)) + 16}px, 1fr))` }}>
      {catalog[section.list].map(opt => {
        const selected = layers[section.field] === opt.id;
        const look = layersToLook({ ...layers, [section.field]: opt.id }, catalog);
        // Face options are compared up close, without hair falling over the features.
        if (section.view === 'face') look.hair = null;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onPick(section.field, opt.id)}
            aria-pressed={selected}
            className={`relative flex flex-col items-center gap-1 rounded-xl p-1 border-4 bg-white transition-transform ${
              selected ? 'border-gold scale-105' : 'border-transparent'
            }`}
          >
            <PriceTag item={opt} owned={owned} />
            <CharacterView look={look} view={section.view} size={section.size} label={opt.name} />
            <span className="text-[11px] text-gray-600 font-semibold w-full text-center truncate">{opt.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ColorOptions({ section, catalog, layers, owned, onPick }) {
  return (
    <div className="flex flex-wrap gap-3">
      {catalog[section.list].map(opt => {
        const selected = layers[section.field] === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onPick(section.field, opt.id)}
            aria-label={`${section.label}: ${opt.name || opt.hex}${priceOf(opt) && !owned.has(opt.id) ? `, cuesta ${priceOf(opt)} tokens` : ''}`}
            aria-pressed={selected}
            className={`relative w-11 h-11 rounded-full border-4 transition-transform ${selected ? 'border-gold scale-110' : 'border-gray-700'}`}
            style={{ backgroundColor: opt.hex }}
          >
            <PriceTag item={opt} owned={owned} />
          </button>
        );
      })}
    </div>
  );
}

export default function CharacterEditor() {
  const [catalog, setCatalog] = useState(null);
  const [layers, setLayers] = useState(null);
  const [isNew, setIsNew] = useState(true);
  const [character, setCharacter] = useState(null);
  const [owned, setOwned] = useState(new Set());
  const [tokens, setTokens] = useState(0);
  const [tab, setTab] = useState('piel');
  const [nameDraft, setNameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const narrow = useNarrow();

  useEffect(() => {
    Promise.all([getCharacterCatalog(), getCharacterMe().catch(err => err), getStudentMe()])
      .then(([catalogRes, characterRes, meRes]) => {
        setCatalog(catalogRes.data);
        setTokens(meRes.data.student?.tokens_balance ?? 0);
        const existing = characterRes?.data?.character;
        // A character saved with an older catalog starts over from fresh defaults.
        if (existing && existing.layers?.hairStyle) {
          setCharacter(existing);
          setLayers({ ...defaultLayers(catalogRes.data), ...existing.layers });
          setOwned(new Set(characterRes.data.ownedItems || []));
          setIsNew(false);
        } else {
          if (existing) setCharacter(existing);
          setLayers(defaultLayers(catalogRes.data));
          setIsNew(!existing);
        }
      })
      .catch(() => setError('No pudimos cargar el editor. Inténtalo de nuevo.'))
      .finally(() => setLoading(false));
  }, []);

  const look = useMemo(() => layersToLook(layers, catalog), [layers, catalog]);
  const itemOf = (section, id) => catalog[section.list].find(o => o.id === id);
  const isLocked = item => priceOf(item) > 0 && !owned.has(item.id);
  const lockedSelected = catalog && layers
    ? ALL_SECTIONS.map(s => ({ section: s, item: itemOf(s, layers[s.field]) })).filter(({ item }) => item && isLocked(item))
    : [];
  const renameCost = catalog?.renameCost ?? 100;
  const renameIsFree = character?.name_status === 'rejected' || !character?.name;

  const setLayer = (field, value) => {
    setLayers(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleBuy = async item => {
    setBuying(item.id);
    setError('');
    try {
      const res = await buyCharacterItem(item.id);
      setOwned(prev => new Set([...prev, item.id]));
      setTokens(res.data.tokens);
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos comprarlo. Inténtalo de nuevo.');
    } finally {
      setBuying(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await saveCharacter(layers, isNew ? nameDraft : undefined);
      setCharacter(res.data.character);
      setIsNew(false);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos guardar tu personaje. ¡Inténtalo de nuevo!');
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await renameCharacter(nameDraft);
      setCharacter(res.data.character);
      if (res.data.tokens != null) setTokens(res.data.tokens);
      setRenaming(false);
      setNameDraft('');
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos cambiar el nombre.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando editor...</div>;
  }
  if (!catalog || !layers) {
    return <div className="min-h-screen flex items-center justify-center text-wrong">{error}</div>;
  }

  const draftLength = nameDraft.trim().length;
  const nameReady = draftLength >= 3 && draftLength <= 20;
  const showNameInput = isNew || renaming || character?.name_status === 'rejected';
  const activeTab = TABS.find(t => t.key === tab);
  // A dress covers the bottom, so that choice would change nothing on screen.
  const dressOn = catalog.tops.find(t => t.id === layers.top)?.coversBottom;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      <header className="w-full max-w-3xl flex items-center justify-between mb-4">
        <button onClick={() => navigate('/alumno')} className="text-gray-500 hover:text-gray-300 text-sm">← Volver</button>
        <h1 className="text-xl font-black text-brand-light">{isNew ? '¡Crea tu personaje!' : 'Editar personaje'}</h1>
        <Tokens value={tokens} />
      </header>

      <div className="w-full max-w-3xl grid gap-5 md:grid-cols-[260px_1fr]">
        <aside className="md:sticky md:top-4 self-start space-y-4">
          <div className="bg-white rounded-2xl p-3 shadow-xl flex flex-col items-center">
            <CharacterView look={look} size={narrow ? 260 : 340} label="Tu personaje" />
            {!isNew && character?.name && (
              <div className="text-center mt-2">
                <p className="text-2xl font-black text-gray-900">{character.name}</p>
                <p className={`text-xs ${NAME_STATUS[character.name_status]?.className}`}>{NAME_STATUS[character.name_status]?.text}</p>
              </div>
            )}
          </div>

          <div className="bg-card rounded-2xl p-4 shadow-xl">
            {showNameInput ? (
              <>
                <label htmlFor="character-name" className="text-sm font-semibold text-gray-300">
                  {isNew ? 'Nombre de tu personaje' : 'Nuevo nombre'}
                </label>
                <input
                  id="character-name"
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  maxLength={20}
                  autoComplete="off"
                  className="mt-2 w-full bg-surface border border-gray-700 focus:border-brand rounded-xl px-4 py-3 text-lg text-white outline-none"
                  placeholder="Ej: Puma Veloz"
                />
                <p className="text-gray-500 text-xs mt-2">
                  {isNew
                    ? `Elígelo con cuidado: cambiarlo después cuesta ${renameCost} tokens. Un profesor lo revisa.`
                    : renameIsFree ? 'Este cambio es gratis. Un profesor lo revisa.' : `Cambiarlo cuesta ${renameCost} tokens. Un profesor lo revisa.`}
                </p>
                {!isNew && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleRename}
                      disabled={!nameReady || saving || (!renameIsFree && tokens < renameCost)}
                      className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors"
                    >
                      {renameIsFree ? 'Guardar nombre' : `Cambiar por 🪙 ${renameCost}`}
                    </button>
                    {renaming && (
                      <button type="button" onClick={() => { setRenaming(false); setNameDraft(''); }} className="bg-surface border border-gray-700 text-gray-300 font-bold px-4 rounded-xl">
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <button type="button" onClick={() => setRenaming(true)} className="w-full text-sm text-brand-light underline">
                Cambiar el nombre (🪙 {renameCost})
              </button>
            )}
          </div>
        </aside>

        <main className="space-y-4">
          <div role="tablist" className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`py-2.5 rounded-xl font-bold transition-colors ${tab === t.key ? 'bg-brand text-white' : 'bg-card text-gray-400 hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab.sections.filter(section => !(dressOn && ['bottom', 'bottomColor'].includes(section.field))).map(section => {
            const selectedItem = itemOf(section, layers[section.field]);
            const Options = section.type === 'color' ? ColorOptions : PartOptions;
            return (
              <section key={section.field} className="bg-card rounded-2xl p-4 shadow-xl">
                <h2 className="text-sm font-semibold text-gray-300 mb-3">{section.label}</h2>
                <Options section={section} catalog={catalog} layers={layers} owned={owned} onPick={setLayer} />
                {selectedItem && isLocked(selectedItem) && (
                  <div className="mt-3 flex items-center justify-between gap-3 bg-surface rounded-xl px-3 py-2">
                    <span className="text-sm text-gray-300">¿Te gusta? Cuesta <Tokens value={priceOf(selectedItem)} /></span>
                    <button
                      type="button"
                      onClick={() => handleBuy(selectedItem)}
                      disabled={buying === selectedItem.id || tokens < priceOf(selectedItem)}
                      className="bg-gold hover:brightness-110 disabled:opacity-40 text-black font-black text-sm px-4 py-2 rounded-xl"
                    >
                      {tokens < priceOf(selectedItem) ? `Te faltan ${priceOf(selectedItem) - tokens}` : 'Comprar'}
                    </button>
                  </div>
                )}
              </section>
            );
          })}

          {error && <p className="text-wrong text-sm text-center">{error}</p>}
          {saved && !error && <p className="text-correct text-sm text-center font-semibold">¡Tu personaje quedó guardado!</p>}
          {lockedSelected.length > 0 && (
            <p className="text-gray-400 text-sm text-center">
              Para guardar, compra o cambia lo que tiene candado:{' '}
              {lockedSelected.map(({ section, item }) => `${section.label.toLowerCase()} ${item.name?.toLowerCase() ?? ''}`).join(', ')}.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || lockedSelected.length > 0 || (isNew && !nameReady)}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
          >
            {saving ? 'Guardando...' : isNew ? 'Crear mi personaje' : 'Guardar cambios'}
          </button>
        </main>
      </div>
    </div>
  );
}
