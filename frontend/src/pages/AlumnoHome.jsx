import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getStudentMe, getCharacterCatalog, getCharacterMe, getCharacterStats, getPetCatalog, getPetMe, markPetSeen } from '../api/client';
import { getStudentUser, studentLogout } from '../api/studentAuth';
import CharacterView from '../components/character/CharacterView';
import { layersToLook } from '../components/character/look';
import AttributeSheet from '../components/AttributeSheet';
import PetView from '../components/pet/PetView';
import { TokenCoin } from '../components/TokenCoin';

// Shown once per new stage: the pet grew since the student last looked.
function GrowthCelebration({ pet, catalog, stage, onClose }) {
  const label = catalog.stages.find(s => s.stage === stage)?.label ?? '';
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="growth-title">
      <div className="bg-card rounded-2xl p-6 shadow-2xl max-w-xs w-full text-center animate-pop">
        <p id="growth-title" className="text-2xl font-black text-gold">¡{pet.name} creció!</p>
        <div className="flex justify-center my-3">
          <PetView species={pet.species} stage={stage} size={180} catalog={catalog} label={pet.name} hop />
        </div>
        <p className="text-white font-semibold">Ahora es {label.toLowerCase()}.</p>
        <p className="text-gray-400 text-sm mt-1">Creció contigo, por cada día que jugaste.</p>
        <button type="button" onClick={onClose} autoFocus className="mt-5 w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl text-lg">
          ¡Genial!
        </button>
      </div>
    </div>
  );
}

export default function AlumnoHome() {
  const [student, setStudent] = useState(getStudentUser());
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState(null);
  const [character, setCharacter] = useState(null);
  const [attributes, setAttributes] = useState(null);
  const [petCatalog, setPetCatalog] = useState(null);
  const [petInfo, setPetInfo] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getStudentMe()
      .then(res => setStudent(res.data.student))
      .catch(() => {
        studentLogout();
        navigate('/?modo=alumno', { replace: true });
      })
      .finally(() => setLoading(false));

    getCharacterCatalog().then(res => setCatalog(res.data));
    getCharacterMe()
      .then(res => setCharacter(res.data.character))
      .catch(() => setCharacter(null));
    getCharacterStats()
      .then(res => setAttributes(res.data.attributes))
      .catch(() => setAttributes(null));
    getPetCatalog().then(res => setPetCatalog(res.data)).catch(() => {});
    getPetMe().then(res => setPetInfo(res.data)).catch(() => setPetInfo(null));
  }, []);

  const pet = petInfo?.pet;
  const growth = petInfo?.growth;
  const grew = pet && growth && growth.stage > pet.stage_seen;
  const closeCelebration = () => {
    setPetInfo(info => ({ ...info, pet: { ...info.pet, stage_seen: info.growth.stage } }));
    markPetSeen().catch(() => {});
  };

  const handleLogout = () => {
    studentLogout();
    navigate('/?modo=alumno', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <header className="w-full max-w-sm flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-brand-light">
          Academ<span className="text-gold">IA</span>
        </h1>
        <button onClick={handleLogout} className="text-gray-500 hover:text-gray-300 text-sm">
          Salir
        </button>
      </header>

      <main className="w-full max-w-sm space-y-6">
        <div className="bg-card rounded-2xl p-6 shadow-xl text-center">
          <h2 className="text-3xl font-black text-white mb-1">¡Hola, {student?.first_name?.split(' ')[0] || 'alumno'}!</h2>
          <p className="text-gray-500 text-sm">{student?.course_name}</p>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-xl text-center">
          <p className="text-gray-400 text-sm mb-1">Tus tokens</p>
          {loading ? (
            <p className="text-gray-500">Cargando...</p>
          ) : (
            <p className="text-5xl font-black text-gold inline-flex items-center gap-3 tabular-nums">
              <TokenCoin size={56} />
              {student?.tokens_balance ?? 0}
            </p>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-xl text-center">
          {character ? (
            <>
              <div className="flex justify-center mb-3">
                <div className="bg-white rounded-2xl p-2">
                  <CharacterView look={layersToLook(character.layers, catalog)} size={220} label={character.name || 'Tu personaje'} />
                </div>
              </div>
              {character.name && <p className="text-2xl font-black text-white mb-1">{character.name}</p>}
              {character.name_status === 'rejected' && (
                <p className="text-wrong text-sm mb-3">Tu nombre no fue aprobado. Elige otro: es gratis.</p>
              )}
              <Link
                to="/alumno/personaje"
                className="inline-block bg-surface hover:bg-gray-800 text-brand-light font-semibold px-5 py-2 rounded-xl transition-colors"
              >
                Editar personaje
              </Link>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-3">Aún no tienes personaje</p>
              <Link
                to="/alumno/personaje"
                className="inline-block bg-brand hover:bg-brand-dark text-white font-black px-6 py-3 rounded-xl text-lg transition-colors"
              >
                ¡Crea tu personaje!
              </Link>
            </>
          )}
        </div>

        {petCatalog && petInfo && (
          <div className="bg-card rounded-2xl p-6 shadow-xl text-center">
            {pet ? (
              <>
                <div className="flex justify-center">
                  <PetView species={pet.species} stage={growth.stage} size={150} catalog={petCatalog} label={pet.name} />
                </div>
                <p className="text-2xl font-black text-white mt-1">{pet.name}</p>
                <p className="text-gray-400 text-sm">
                  {petCatalog.stages.find(s => s.stage === growth.stage)?.label}
                  {growth.nextStage ? ` · crece en ${growth.daysToNext} ${growth.daysToNext === 1 ? 'día' : 'días'} de juego` : ''}
                </p>
                {pet.name_status === 'rejected' && (
                  <p className="text-wrong text-sm mt-1">El nombre de tu compañero no fue aprobado. Elige otro: es gratis.</p>
                )}
                <Link
                  to="/alumno/companero"
                  className="inline-block mt-3 bg-surface hover:bg-gray-800 text-brand-light font-semibold px-5 py-2 rounded-xl transition-colors"
                >
                  Ver a tu compañero
                </Link>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-1 mb-2" aria-hidden="true">
                  {['pudu', 'chungungo', 'pinguino'].map(s => (
                    <PetView key={s} species={s} stage={1} size={70} catalog={petCatalog} idle={false} />
                  ))}
                </div>
                <p className="text-gray-300 mb-3">Un compañero te acompañará en tus aventuras y crecerá contigo.</p>
                <Link
                  to="/alumno/companero"
                  className="inline-block bg-brand hover:bg-brand-dark text-white font-black px-6 py-3 rounded-xl text-lg transition-colors"
                >
                  ¡Elige tu compañero!
                </Link>
              </>
            )}
          </div>
        )}

        {character && <AttributeSheet attributes={attributes} />}

        <p className="text-center text-gray-500 text-sm">
          ¿Vas a jugar en clase?{' '}
          <Link to="/?modo=clase" className="text-brand-light underline">Entra con el código de sala</Link>
        </p>
      </main>
      {grew && petCatalog && (
        <GrowthCelebration pet={pet} catalog={petCatalog} stage={growth.stage} onClose={closeCelebration} />
      )}
    </div>
  );
}
