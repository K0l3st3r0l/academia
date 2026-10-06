import { INK, Stars, Star, LockIcon, HourglassIcon } from './WorldParts';

// Colors of the level button by state: top face, its darker side (the button has thickness).
const LOOK = {
  open: { top: '#6C3CE1', side: '#4A1FA8', text: '#FFFFFF' },
  done: { top: '#F5C842', side: '#C98B1C', text: INK },
  locked: { top: '#A7AFC2', side: '#7C849A', text: INK },
  preparing: { top: '#EEF1F8', side: '#BCC3D6', text: INK },
};
const CHALLENGE_OPEN = { top: '#F87171', side: '#C24848', text: '#FFFFFF' };

function describe(level, number) {
  const name = level.challenge ? level.label : `Nivel ${number}: ${level.label}`;
  if (level.state === 'locked') return `${name}. Cerrado`;
  if (level.state === 'preparing') return `${name}. En preparación`;
  return `${name}. ${level.stars} de 3 estrellas`;
}

// One level on the map, centred on its stone pad (x, y in image pixels of the island).
export default function MapNode({ level, number, island, current, celebrate, onSelect, buttonRef }) {
  const { challenge } = level;
  const look = challenge && level.state === 'open' ? CHALLENGE_OPEN : LOOK[level.state];
  const [x, y] = level.at;
  const width = challenge ? 15 : 10.5;
  const showStars = level.state === 'done' || (level.state === 'open' && level.stars > 0);

  return (
    <div
      className="absolute"
      style={{
        left: `${(x / island.width) * 100}%`,
        top: `${(y / island.height) * 100}%`,
        width: `${width}%`,
        transform: 'translate(-50%, -62%)',
        // Sorted by depth with the walking character and pet (Explorer): nearer pads in front.
        zIndex: 100 + Math.round(y / 4),
      }}
    >
      {showStars && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-[-6%] flex justify-center w-[140%]">
          <Stars value={level.stars} size={challenge ? 18 : 14} pop={celebrate} gap={0} />
        </div>
      )}
      {current && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full world-pulse"
          style={{ border: `4px solid ${challenge ? '#F87171' : '#FFFFFF'}`, top: '4%', bottom: '8%' }}
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={e => {
          e.stopPropagation(); // a tap on a level is not a tap on the path
          onSelect(level, e);
        }}
        aria-label={describe(level, number)}
        className={`relative block w-full aspect-square focus:outline-none focus-visible:ring-4 focus-visible:ring-white rounded-full ${current ? 'world-bob' : ''}`}
        style={{ opacity: level.state === 'preparing' ? 0.85 : 1 }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" aria-hidden="true">
          <ellipse cx="50" cy="92" rx="34" ry="8" fill={INK} opacity="0.25" />
          <circle cx="50" cy="54" r="40" fill={look.side} stroke={INK} strokeWidth="6" />
          <circle cx="50" cy="46" r="40" fill={look.top} stroke={INK} strokeWidth="6"
            strokeDasharray={level.state === 'preparing' ? '10 8' : undefined} />
          <ellipse cx="34" cy="28" rx="13" ry="7" transform="rotate(-30 34 28)" fill="#fff" opacity="0.35" />
          {level.state === 'locked' && <g transform="translate(26 22) scale(2)"><LockIcon size={24} /></g>}
          {level.state === 'preparing' && <g transform="translate(29 25) scale(1.75)"><HourglassIcon size={24} /></g>}
          {(level.state === 'open' || level.state === 'done') && !challenge && (
            <text x="50" y="61" textAnchor="middle" fontSize="42" fontWeight="900" fontFamily="Nunito, sans-serif"
              fill={look.text} stroke={look.text === '#FFFFFF' ? INK : 'none'} strokeWidth="1.5" paintOrder="stroke">
              {number}
            </text>
          )}
          {(level.state === 'open' || level.state === 'done') && challenge && (
            <g transform="translate(22 18) scale(2.35)"><Star filled size={24} /></g>
          )}
        </svg>
      </button>
    </div>
  );
}
