import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCharacterCatalog, getCharacterMe, saveCharacter } from '../api/client';
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

function defaultLayers(catalog) {
  const layers = {};
  for (const cat of CATEGORIES) layers[cat.key] = catalog[cat.catalogKey][0].id;
  return layers;
}

export default function CharacterEditor() {
  const [catalog, setCatalog] = useState(null);
  const [layers, setLayers] = useState(null);
  const [isNew, setIsNew] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getCharacterCatalog(), getCharacterMe().catch(err => err)])
      .then(([catalogRes, characterRes]) => {
        setCatalog(catalogRes.data);
        if (characterRes?.data?.character) {
          setLayers(characterRes.data.character.layers);
          setIsNew(false);
        } else {
          setLayers(defaultLayers(catalogRes.data));
          setIsNew(true);
        }
      })
      .catch(() => setError('No pudimos cargar el editor. Inténtalo de nuevo.'))
      .finally(() => setLoading(false));
  }, []);

  const setLayer = (key, value) => {
    setLayers(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await saveCharacter(layers);
      setIsNew(false);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos guardar tu personaje. ¡Inténtalo de nuevo!');
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

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <header className="w-full max-w-md flex items-center justify-between mb-4">
        <button onClick={() => navigate('/alumno')} className="text-gray-500 hover:text-gray-300 text-sm">
          ← Volver
        </button>
        <h1 className="text-xl font-black text-brand-light">
          {isNew ? '¡Crea tu personaje!' : 'Editar personaje'}
        </h1>
        <span className="w-12" />
      </header>

      <div className="bg-card rounded-2xl p-6 shadow-xl flex items-center justify-center mb-6">
        <Avatar layers={layers} catalog={catalog} size={200} />
      </div>

      <main className="w-full max-w-md space-y-5">
        {CATEGORIES.map(cat => (
          <div key={cat.key} className="bg-card rounded-2xl p-4 shadow-xl">
            <p className="text-sm font-semibold text-gray-300 mb-3">{cat.label}</p>
            <div className="flex flex-wrap gap-3">
              {catalog[cat.catalogKey].map(opt => {
                const selected = layers[cat.key] === opt.id;
                if (cat.type === 'color') {
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLayer(cat.key, opt.id)}
                      aria-label={cat.label}
                      aria-pressed={selected}
                      className={`w-11 h-11 rounded-full border-4 transition-transform ${
                        selected ? 'border-gold scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: opt.hex }}
                    />
                  );
                }
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLayer(cat.key, opt.id)}
                    aria-pressed={selected}
                    className={`flex flex-col items-center gap-1 rounded-xl p-1 border-4 transition-transform ${
                      selected ? 'border-gold scale-105 bg-surface' : 'border-transparent bg-surface'
                    }`}
                  >
                    <Avatar layers={{ ...layers, [cat.key]: opt.id }} catalog={catalog} size={64} />
                    <span className="text-xs text-gray-400">{opt.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {error && <p className="text-wrong text-sm text-center">{error}</p>}
        {saved && !error && (
          <p className="text-correct text-sm text-center font-semibold">¡Tu personaje quedó guardado!</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
        >
          {saving ? 'Guardando...' : isNew ? 'Crear mi personaje' : 'Guardar cambios'}
        </button>
      </main>
    </div>
  );
}
