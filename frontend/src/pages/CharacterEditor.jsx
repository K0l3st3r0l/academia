import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCharacterCatalog, getCharacterMe, getStudentMe, saveCharacter, renameCharacter, buyCharacterItem,
} from '../api/client';
import Avatar from '../components/Avatar';

const CATEGORIES = [
  { key: 'skinTone', catalogKey: 'skinTones', label: 'Tono de piel', type: 'color' },
  { key: 'hairStyle', catalogKey: 'hairStyles', label: 'Peinado', type: 'preview' },
  { key: 'hairColor', catalogKey: 'hairColors', label: 'Color de pelo', type: 'color' },
  { key: 'face', catalogKey: 'faces', label: 'Rostro', type: 'preview' },
  { key: 'outfit', catalogKey: 'outfits', label: 'Ropa', type: 'preview' },
  { key: 'outfitColor', catalogKey: 'outfitColors', label: 'Color de ropa', type: 'color' },
  { key: 'accessory', catalogKey: 'accessories', label: 'Accesorio', type: 'preview' },
];

const NAME_STATUS = {
  pending: { text: 'En revisión', className: 'text-gray-400' },
  approved: { text: 'Aprobado', className: 'text-correct' },
  rejected: { text: 'No fue aprobado: elige otro, es gratis', className: 'text-wrong' },
};

function defaultLayers(catalog) {
  const layers = {};
  for (const cat of CATEGORIES) layers[cat.key] = catalog[cat.catalogKey][0].id;
  return layers;
}

const priceOf = item => item?.price ?? 0;

function Tokens({ value }) {
  return <span className="font-black text-gold tabular-nums">🪙 {value}</span>;
}

export default function CharacterEditor() {
  const [catalog, setCatalog] = useState(null);
  const [layers, setLayers] = useState(null);
  const [isNew, setIsNew] = useState(true);
  const [character, setCharacter] = useState(null);
  const [owned, setOwned] = useState(new Set());
  const [tokens, setTokens] = useState(0);
  const [nameDraft, setNameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getCharacterCatalog(), getCharacterMe().catch(err => err), getStudentMe()])
      .then(([catalogRes, characterRes, meRes]) => {
        setCatalog(catalogRes.data);
        setTokens(meRes.data.student?.tokens_balance ?? 0);
        if (characterRes?.data?.character) {
          setCharacter(characterRes.data.character);
          setLayers(characterRes.data.character.layers);
          setOwned(new Set(characterRes.data.ownedItems || []));
          setIsNew(false);
        } else {
          setLayers(defaultLayers(catalogRes.data));
          setIsNew(true);
        }
      })
      .catch(() => setError('No pudimos cargar el editor. Inténtalo de nuevo.'))
      .finally(() => setLoading(false));
  }, []);

  const itemOf = (cat, id) => catalog[cat.catalogKey].find(o => o.id === id);
  const isLocked = item => priceOf(item) > 0 && !owned.has(item.id);
  const lockedSelected = catalog && layers
    ? CATEGORIES.map(cat => itemOf(cat, layers[cat.key])).filter(item => item && isLocked(item))
    : [];
  const renameCost = catalog?.renameCost ?? 100;
  const renameIsFree = character?.name_status === 'rejected' || !character?.name;

  const setLayer = (key, value) => {
    setLayers(prev => ({ ...prev, [key]: value }));
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
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Cargando editor...
      </div>
    );
  }

  const draftLength = nameDraft.trim().length;
  const nameReady = draftLength >= 3 && draftLength <= 20;
  const showNameInput = isNew || renaming || character?.name_status === 'rejected';

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <header className="w-full max-w-md flex items-center justify-between mb-4">
        <button onClick={() => navigate('/alumno')} className="text-gray-500 hover:text-gray-300 text-sm">
          ← Volver
        </button>
        <h1 className="text-xl font-black text-brand-light">
          {isNew ? '¡Crea tu personaje!' : 'Editar personaje'}
        </h1>
        <Tokens value={tokens} />
      </header>

      <div className="bg-card rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center mb-6">
        <Avatar layers={layers} catalog={catalog} size={200} />
        {!isNew && character?.name && (
          <div className="text-center mt-3">
            <p className="text-2xl font-black text-white">{character.name}</p>
            <p className={`text-xs ${NAME_STATUS[character.name_status]?.className}`}>
              {NAME_STATUS[character.name_status]?.text}
            </p>
          </div>
        )}
      </div>

      <main className="w-full max-w-md space-y-5">
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
                  : renameIsFree
                    ? 'Este cambio es gratis. Un profesor lo revisa.'
                    : `Cambiarlo cuesta ${renameCost} tokens. Un profesor lo revisa.`}
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
                    <button
                      type="button"
                      onClick={() => { setRenaming(false); setNameDraft(''); }}
                      className="bg-surface border border-gray-700 text-gray-300 font-bold px-4 rounded-xl"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              )}
              {!isNew && !renameIsFree && tokens < renameCost && (
                <p className="text-gray-500 text-xs mt-2">Te faltan {renameCost - tokens} tokens.</p>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="w-full text-sm text-brand-light underline"
            >
              Cambiar el nombre (🪙 {renameCost})
            </button>
          )}
        </div>

        {CATEGORIES.map(cat => {
          const selectedItem = itemOf(cat, layers[cat.key]);
          return (
            <div key={cat.key} className="bg-card rounded-2xl p-4 shadow-xl">
              <p className="text-sm font-semibold text-gray-300 mb-3">{cat.label}</p>
              <div className="flex flex-wrap gap-3">
                {catalog[cat.catalogKey].map(opt => {
                  const selected = layers[cat.key] === opt.id;
                  const locked = isLocked(opt);
                  const tag = priceOf(opt) > 0 && (
                    <span className={`absolute -top-2 -right-2 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                      locked ? 'bg-gold text-black' : 'bg-correct text-white'
                    }`}>
                      {locked ? `🔒 ${priceOf(opt)}` : 'Tuyo'}
                    </span>
                  );
                  if (cat.type === 'color') {
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setLayer(cat.key, opt.id)}
                        aria-label={`${cat.label}${locked ? `, cuesta ${priceOf(opt)} tokens` : ''}`}
                        aria-pressed={selected}
                        className={`relative w-11 h-11 rounded-full border-4 transition-transform ${
                          selected ? 'border-gold scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: opt.hex }}
                      >
                        {tag}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLayer(cat.key, opt.id)}
                      aria-pressed={selected}
                      className={`relative flex flex-col items-center gap-1 rounded-xl p-1 border-4 transition-transform ${
                        selected ? 'border-gold scale-105 bg-surface' : 'border-transparent bg-surface'
                      }`}
                    >
                      {tag}
                      <Avatar layers={{ ...layers, [cat.key]: opt.id }} catalog={catalog} size={64} />
                      <span className="text-xs text-gray-400">{opt.name}</span>
                    </button>
                  );
                })}
              </div>
              {selectedItem && isLocked(selectedItem) && (
                <div className="mt-3 flex items-center justify-between gap-3 bg-surface rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-300">
                    ¿Te gusta? Cuesta <Tokens value={priceOf(selectedItem)} />
                  </span>
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
            </div>
          );
        })}

        {error && <p className="text-wrong text-sm text-center">{error}</p>}
        {saved && !error && (
          <p className="text-correct text-sm text-center font-semibold">¡Tu personaje quedó guardado!</p>
        )}
        {lockedSelected.length > 0 && (
          <p className="text-gray-400 text-sm text-center">Compra lo que tiene candado o elige otra opción para guardar.</p>
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
  );
}
