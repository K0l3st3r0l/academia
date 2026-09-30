import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOpenRooms } from '../api/client';
import { subjectLabel } from '../utils/subjects';

// Short enough that a room shows up while the teacher is still setting up the projector.
const POLL_MS = 5000;

export default function OpenRooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (document.hidden) return;
      getOpenRooms()
        .then(res => { if (!cancelled) setRooms(res.data.rooms); })
        // Keep the last list on a hiccup; the code form below still works.
        .catch(() => { if (!cancelled) setRooms(prev => prev ?? []); });
    };

    load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  if (rooms === null) return null;

  const enter = (room) => {
    // StudentJoin skips the lookup when it gets the room it's opening.
    navigate(`/join/${room.code}`, { state: { roomData: { room } } });
  };

  return (
    <div className="mb-5" aria-live="polite">
      {rooms.length === 0 ? (
        <p className="flex items-center justify-center gap-2 text-gray-500 text-sm text-center">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-light opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-light" />
          </span>
          Buscando salas… aparecerán aquí cuando tu profe cree una.
        </p>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-gray-300 mb-2 text-center">
            {rooms.length === 1 ? 'Sala abierta ahora' : 'Salas abiertas ahora'}
          </h3>
          <ul className="space-y-2">
            {rooms.map(room => (
              <li key={room.code}>
                <button
                  type="button"
                  onClick={() => enter(room)}
                  className="w-full flex items-center justify-between gap-3 text-left bg-surface hover:bg-gray-800 border-2 border-brand/40 hover:border-brand rounded-xl px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
                >
                  <span className="min-w-0">
                    <span className="block font-black text-white text-lg leading-tight truncate">{room.course_name}</span>
                    <span className="block text-sm text-gray-400">
                      {subjectLabel(room.subject)}
                      {room.status === 'active' && <span className="text-gold"> · en juego</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-gold font-black tracking-widest">{room.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="flex items-center gap-3 text-gray-500 text-xs mt-5" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-700" />
        o escribe el código
        <span className="h-px flex-1 bg-gray-700" />
      </p>
    </div>
  );
}
