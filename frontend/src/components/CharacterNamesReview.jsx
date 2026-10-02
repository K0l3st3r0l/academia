import { useEffect, useState } from 'react';
import { getCharacterNames, reviewCharacterName, getPetNames, reviewPetName } from '../api/client';

const TABS = [
  { value: 'pending', label: 'Por revisar' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'rejected', label: 'Rechazados' },
];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

const SOURCES = {
  character: { load: getCharacterNames, review: reviewCharacterName },
  pet: { load: getPetNames, review: reviewPetName },
};

// Admin only: every name students type (for their character or their pet) goes through here.
export default function CharacterNamesReview({ kind = 'character' }) {
  const { load, review: save } = SOURCES[kind];
  const [status, setStatus] = useState('pending');
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    load(status)
      .then(res => { if (!cancelled) setNames(res.data.names); })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar los nombres.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, load]);

  const review = async (studentId, next) => {
    setBusy(studentId);
    try {
      await save(studentId, next);
      setNames(prev => prev.filter(n => n.student_id !== studentId));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la revisión.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4" role="tablist">
        {TABS.map(t => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={status === t.value}
            onClick={() => setStatus(t.value)}
            className={`py-1.5 px-3 rounded-xl text-sm font-semibold transition-colors ${
              status === t.value ? 'bg-brand text-white' : 'bg-surface text-gray-400 hover:text-white border border-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-wrong text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="text-gray-500 text-sm">Cargando…</p>
      ) : names.length === 0 ? (
        <p className="text-gray-500 text-sm">{status === 'pending' ? 'No hay nombres por revisar.' : 'No hay nombres en esta lista.'}</p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {names.map(n => (
            <li key={n.student_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-white text-lg">{n.name}</p>
                <p className="text-gray-400 text-xs">
                  {n.first_name} {n.last_name} · {n.course_name}{n.species ? ` · ${n.species}` : ''} · {formatDate(n.name_set_at)}
                </p>
              </div>
              <div className="flex gap-2">
                {n.name_status !== 'approved' && (
                  <button
                    type="button"
                    disabled={busy === n.student_id}
                    onClick={() => review(n.student_id, 'approved')}
                    className="text-sm bg-correct hover:bg-green-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Aprobar
                  </button>
                )}
                {n.name_status !== 'rejected' && (
                  <button
                    type="button"
                    disabled={busy === n.student_id}
                    onClick={() => review(n.student_id, 'rejected')}
                    className="text-sm bg-surface border border-gray-700 hover:border-wrong text-gray-300 hover:text-wrong disabled:opacity-50 font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Rechazar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-gray-500 text-xs mt-4">Si rechazas un nombre, el alumno elige otro gratis.</p>
    </div>
  );
}
