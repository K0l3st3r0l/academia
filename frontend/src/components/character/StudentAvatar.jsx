import { useEffect, useMemo, useState } from 'react';
import { getCharacterCatalog } from '../../api/client';
import CharacterView from './CharacterView';
import { layersToLook } from './look';

// One catalog request per page, however many avatars are on screen.
let catalogPromise;
function useCharacterCatalog() {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    catalogPromise ??= getCharacterCatalog().then(res => res.data).catch(() => {
      catalogPromise = undefined;
      return null;
    });
    let cancelled = false;
    catalogPromise.then(c => { if (!cancelled) setCatalog(c); });
    return () => { cancelled = true; };
  }, []);
  return catalog;
}

const FALLBACK_COLORS = ['#6C3CE1', '#14B8A6', '#F5C842', '#F87171', '#3B82F6', '#22C55E'];

function initialsOf(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

function colorOf(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

// Head-and-shoulders portrait of a student's character, or their initials when they have
// none. avatar: the saved layers (catalog ids) as the server sends them in a room.
export default function StudentAvatar({ avatar, name, size = 48, className = '' }) {
  const catalog = useCharacterCatalog();
  const key = avatar ? JSON.stringify(avatar) : '';
  const look = useMemo(() => (avatar && catalog ? layersToLook(avatar, catalog) : null), [key, catalog]);
  const box = `rounded-full overflow-hidden flex items-end justify-center shrink-0 ${className}`;

  if (look?.hair || look?.skinColor) {
    return (
      <span className={`${box} bg-white`} style={{ width: size, height: size }}>
        <CharacterView look={look} view="head" size={size} label={name ? `Personaje de ${name}` : 'Personaje'} />
      </span>
    );
  }
  return (
    <span
      className={`${box} items-center font-black text-white`}
      style={{ width: size, height: size, backgroundColor: colorOf(name), fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
