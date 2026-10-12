import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getWorldMaps, getAcademyMe } from '../api/client';
import { Star } from '../components/world/WorldParts';
import { SUBJECT_NAMES } from './WorldMap';
import TitleBackdrop from '../components/welcome/TitleBackdrop';

// The Islands of challenges: an extra beside the Academy's story, one subject per archipelago,
// each island a zone of Chile. Picking a subject opens its map at the island the student is on.
export default function IslandsHub() {
  const navigate = useNavigate();
  const [maps, setMaps] = useState(null);
  const [academyOpen, setAcademyOpen] = useState(false);

  useEffect(() => {
    getWorldMaps().then(res => setMaps(res.data.maps)).catch(() => setMaps([]));
    getAcademyMe().then(res => setAcademyOpen(res.data.snapshot.open)).catch(() => {});
  }, []);

  return (
    <div className="relative isolate min-h-screen flex flex-col items-center px-4 py-6">
      <TitleBackdrop />
      <header className="w-full max-w-sm flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('/alumno')}
          aria-label="Volver al inicio"
          className="w-11 h-11 rounded-full bg-card/90 text-white font-black text-xl hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          ←
        </button>
        <h1 className="text-2xl font-black text-white drop-shadow-lg mr-auto">Islas de retos</h1>
        {academyOpen && <a href="/academia/" aria-label="Volver a la Academia" title="Volver a la Academia" className="w-11 h-11 rounded-full overflow-hidden border-2 border-gold/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
          <img src="/academia/portada-640.webp" alt="" className="w-full h-full object-cover" />
        </a>}
      </header>

      <main className="w-full max-w-sm space-y-4">
        <p className="text-gray-300 text-sm text-center">Una asignatura por isla. Avanza nivel a nivel y recorre Chile de norte a sur.</p>
        {maps === null && <p className="text-center text-gray-400">Cargando islas…</p>}
        {maps?.length === 0 && <p className="text-center text-gray-300">Tu curso todavía no tiene islas.</p>}
        {maps?.map(m => (
          <Link
            key={m.subject}
            to={`/alumno/mundo/${m.subject}`}
            className="block rounded-2xl overflow-hidden shadow-xl border-4 border-surface relative group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold"
            aria-label={`${SUBJECT_NAMES[m.subject] ?? m.subject}: ${m.island.name}, ${m.stars.earned} de ${m.stars.max} estrellas`}
          >
            <img
              src={`/world/${m.island.image}-640.webp`}
              alt=""
              className="w-full h-36 object-cover transition-transform duration-500 group-hover:scale-105"
              style={{ objectPosition: '50% 55%' }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface/95 via-surface/70 to-transparent px-4 pt-8 pb-3 flex items-end justify-between">
              <div>
                <p className="text-xl font-black text-white leading-tight">{SUBJECT_NAMES[m.subject] ?? m.subject}</p>
                <p className="text-sm text-gray-300">{m.island.name}</p>
              </div>
              <span className="inline-flex items-center gap-1 bg-black/40 text-white font-black px-3 py-1.5 rounded-xl">
                <Star filled size={16} /> {m.stars.earned}<span className="text-gray-400 font-bold">/{m.stars.max}</span>
              </span>
            </div>
          </Link>
        ))}
      </main>
    </div>
  );
}
