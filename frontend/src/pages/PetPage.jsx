import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPetCatalog, getPetMe, adoptPet, changePetSpecies, renamePet } from '../api/client';
import PetView from '../components/pet/PetView';
import { Tokens } from '../components/TokenCoin';

const NAME_STATUS = {
  pending: { text: 'Nombre en revisión', className: 'text-gray-400' },
  approved: { text: 'Nombre aprobado', className: 'text-correct' },
  rejected: { text: 'El nombre no fue aprobado: elige otro, es gratis', className: 'text-wrong' },
};

function SpeciesGrid({ catalog, picked, onPick, current }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {catalog.species.map(s => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPick(s.id)}
          aria-pressed={picked === s.id}
          disabled={current === s.id}
          className={`bg-card rounded-2xl p-3 flex flex-col items-center border-2 transition-colors disabled:opacity-40 ${
            picked === s.id ? 'border-brand' : 'border-transparent hover:border-gray-600'
          }`}
        >
          <PetView species={s.id} stage={1} size={110} catalog={catalog} label={s.label} idle={picked === s.id} />
          <span className="mt-2 font-bold text-white text-sm text-center">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function GrowthPath({ catalog, species, growth }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {catalog.stages.map(s => {
        const reached = !growth || growth.stage >= s.stage;
        return (
          <div key={s.stage} className="flex flex-col items-center text-center">
            <PetView species={species} stage={s.stage} size={84} catalog={catalog} silhouette={!reached} idle={false} label={s.label} />
            <span className={`text-sm font-bold ${reached ? 'text-white' : 'text-gray-500'}`}>{s.label}</span>
            <span className="text-xs text-gray-500">{s.fromDays === 0 ? 'Desde el inicio' : `A los ${s.fromDays} días`}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function PetPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [pet, setPet] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [tokens, setTokens] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [mode, setMode] = useState(null); // 'rename' | 'species' while changing an adopted pet
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getPetCatalog(), getPetMe()])
      .then(([c, me]) => {
        setCatalog(c.data);
        setPet(me.data.pet);
        setGrowth(me.data.growth);
        setTokens(me.data.tokens);
      })
      .catch(() => setError('No pudimos cargar a tu compañero. Intenta de nuevo.'))
      .finally(() => setLoading(false));
  }, []);

  const run = async (action, after) => {
    setSaving(true);
    setError('');
    try {
      const res = await action();
      setPet(res.data.pet);
      if (res.data.growth) setGrowth(res.data.growth);
      if (res.data.tokens != null) setTokens(res.data.tokens);
      after?.();
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos guardar el cambio.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!catalog) return <div className="min-h-screen flex items-center justify-center text-wrong px-4 text-center">{error}</div>;

  const speciesOf = id => catalog.species.find(s => s.id === id);
  const draftLength = nameDraft.trim().length;
  const nameReady = draftLength >= 3 && draftLength <= 20;
  const renameIsFree = pet?.name_status === 'rejected';

  const header = (
    <header className="w-full max-w-2xl flex items-center justify-between mb-5">
      <button onClick={() => navigate('/alumno')} className="text-gray-500 hover:text-gray-300 text-sm">← Volver</button>
      <h1 className="text-xl font-black text-brand-light">{pet ? 'Tu compañero' : 'Elige a tu compañero'}</h1>
      <Tokens value={tokens} />
    </header>
  );

  if (!pet) {
    const chosen = speciesOf(picked);
    return (
      <div className="min-h-screen flex flex-col items-center px-4 py-6">
        {header}
        <main className="w-full max-w-2xl space-y-5">
          <p className="text-gray-300 text-center">
            Te acompañará en tus aventuras y crecerá contigo cada día que juegues.
          </p>
          <SpeciesGrid catalog={catalog} picked={picked} onPick={setPicked} />
          {chosen && (
            <section className="bg-card rounded-2xl p-5 shadow-xl space-y-4">
              <div>
                <h2 className="text-2xl font-black text-white">{chosen.label}</h2>
                <p className="text-gray-400 text-sm mt-1">{chosen.fact}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-2">Así crecerá contigo</h3>
                <GrowthPath catalog={catalog} species={chosen.id} />
              </div>
              <div>
                <label htmlFor="pet-name" className="text-sm font-semibold text-gray-300">¿Cómo se llamará?</label>
                <input
                  id="pet-name"
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  maxLength={20}
                  autoComplete="off"
                  className="mt-2 w-full bg-surface border border-gray-700 focus:border-brand rounded-xl px-4 py-3 text-lg text-white outline-none"
                  placeholder="Ej: Chispita"
                />
                <p className="text-gray-500 text-xs mt-2">
                  Un profesor revisa el nombre. Cambiarlo después cuesta {catalog.renameCost} tokens.
                </p>
              </div>
              {error && <p className="text-wrong text-sm">{error}</p>}
              <button
                type="button"
                disabled={!nameReady || saving}
                onClick={() => run(() => adoptPet(chosen.id, nameDraft), () => setNameDraft(''))}
                className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-black py-4 rounded-xl text-xl transition-colors"
              >
                {saving ? 'Guardando...' : `¡Elijo a ${chosen.label}!`}
              </button>
            </section>
          )}
        </main>
      </div>
    );
  }

  const species = speciesOf(pet.species);
  const stage = catalog.stages.find(s => s.stage === growth.stage);
  const from = stage.fromDays;
  const progress = growth.nextStageAt ? (growth.days - from) / (growth.nextStageAt - from) : 1;
  const nextLabel = catalog.stages.find(s => s.stage === growth.nextStage)?.label;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      {header}
      <main className="w-full max-w-2xl space-y-5">
        <section className="bg-card rounded-2xl p-6 shadow-xl flex flex-col items-center text-center">
          <PetView species={pet.species} stage={growth.stage} size={200} catalog={catalog} label={pet.name} />
          <p className="text-3xl font-black text-white mt-2">{pet.name}</p>
          <p className={`text-xs ${NAME_STATUS[pet.name_status]?.className}`}>{NAME_STATUS[pet.name_status]?.text}</p>
          <p className="text-gray-400 text-sm mt-1">{species?.label} · {stage.label}</p>

          <div className="w-full max-w-sm mt-4">
            <div className="h-3 bg-surface rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
            <p className="text-sm text-gray-300 mt-2">
              {growth.nextStage
                ? `${growth.days} ${growth.days === 1 ? 'día' : 'días'} de juego · será ${nextLabel?.toLowerCase()} en ${growth.daysToNext} ${growth.daysToNext === 1 ? 'día' : 'días'} más`
                : `¡Ya es ${stage.label.toLowerCase()}! ${growth.days} días de juego juntos`}
            </p>
            <p className="text-xs text-gray-500 mt-1">Cuenta cada día en que respondes preguntas, en clase o en casa.</p>
          </div>
        </section>

        <section className="bg-card rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Cómo crece</h2>
          <GrowthPath catalog={catalog} species={pet.species} growth={growth} />
          <p className="text-xs text-gray-500 mt-3">{species?.fact}</p>
        </section>

        <section className="bg-card rounded-2xl p-5 shadow-xl space-y-3">
          {mode === 'rename' || renameIsFree ? (
            <>
              <label htmlFor="pet-rename" className="text-sm font-semibold text-gray-300">Nuevo nombre</label>
              <input
                id="pet-rename"
                type="text"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                maxLength={20}
                autoComplete="off"
                className="w-full bg-surface border border-gray-700 focus:border-brand rounded-xl px-4 py-3 text-lg text-white outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!nameReady || saving || (!renameIsFree && tokens < catalog.renameCost)}
                  onClick={() => run(() => renamePet(nameDraft), () => { setMode(null); setNameDraft(''); })}
                  className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors"
                >
                  {renameIsFree ? 'Guardar nombre' : <>Cambiar por <Tokens value={catalog.renameCost} size={18} className="font-bold" /></>}
                </button>
                {mode === 'rename' && (
                  <button type="button" onClick={() => { setMode(null); setNameDraft(''); }} className="bg-surface border border-gray-700 text-gray-300 font-bold px-4 rounded-xl">
                    Cancelar
                  </button>
                )}
              </div>
            </>
          ) : mode === 'species' ? (
            <>
              <p className="text-sm text-gray-300">
                Elige otro compañero. Conserva su nombre y todo lo que ha crecido. Cuesta <Tokens value={catalog.changeSpeciesCost} />.
              </p>
              <SpeciesGrid catalog={catalog} picked={picked} onPick={setPicked} current={pet.species} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!picked || saving || tokens < catalog.changeSpeciesCost}
                  onClick={() => run(() => changePetSpecies(picked), () => { setMode(null); setPicked(null); })}
                  className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors"
                >
                  {tokens < catalog.changeSpeciesCost
                    ? `Te faltan ${catalog.changeSpeciesCost - tokens} tokens`
                    : picked ? `Cambiar a ${speciesOf(picked)?.label}` : 'Elige uno'}
                </button>
                <button type="button" onClick={() => { setMode(null); setPicked(null); }} className="bg-surface border border-gray-700 text-gray-300 font-bold px-4 rounded-xl">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={() => setMode('rename')} className="flex-1 bg-surface border border-gray-700 hover:border-brand text-gray-200 font-semibold py-2.5 rounded-xl">
                Cambiar el nombre <Tokens value={catalog.renameCost} size={16} />
              </button>
              <button type="button" onClick={() => setMode('species')} className="flex-1 bg-surface border border-gray-700 hover:border-brand text-gray-200 font-semibold py-2.5 rounded-xl">
                Cambiar de compañero <Tokens value={catalog.changeSpeciesCost} size={16} />
              </button>
            </div>
          )}
          {error && <p className="text-wrong text-sm">{error}</p>}
        </section>
      </main>
    </div>
  );
}
