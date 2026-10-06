// Small drawn pieces of the world map, in the game's base style: flat fills, navy outline.
export const INK = '#1A1A2E';

const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 4.6 : 11;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(12 + r * Math.cos(a)).toFixed(2)},${(12.8 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

export function Star({ filled, size = 20, className = '', style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`shrink-0 ${className}`} style={style}>
      <polygon
        points={STAR_POINTS}
        fill={filled ? '#F5C842' : 'rgba(255,255,255,0.55)'}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {filled && <ellipse cx="9" cy="9" rx="1.8" ry="1.1" transform="rotate(-35 9 9)" fill="#fff" opacity="0.8" />}
    </svg>
  );
}

// Three stars, the earned ones filled. With pop, they appear one after another.
export function Stars({ value, size = 20, pop = false, gap = 2, className = '' }) {
  return (
    <span className={`inline-flex items-end ${className}`} style={{ gap }} role="img" aria-label={`${value} de 3 estrellas`}>
      {[0, 1, 2].map(i => (
        <Star
          key={i}
          filled={i < value}
          size={i === 1 ? size * 1.2 : size}
          className={pop ? 'world-star-pop' : ''}
          style={pop ? { animationDelay: `${0.25 + i * 0.35}s` } : undefined}
        />
      ))}
    </span>
  );
}

export function LockIcon({ size = 24, color = INK }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M7.5 10V7.6a4.5 4.5 0 0 1 9 0V10" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="10.5" rx="2.6" fill={color} />
      <circle cx="12" cy="15.2" r="1.7" fill="#fff" />
    </svg>
  );
}

export function HourglassIcon({ size = 24, color = INK }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M7 4h10M7 20h10M8 4c0 5 8 6 8 16M16 4c0 5-8 6-8 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// A soft cumulus: overlapping puffs with one shadow tone, no outline (as in the island art).
export function Cloud({ width = 220, className = '', style, tint = '#FFFFFF', shade = '#DCE2FB' }) {
  return (
    <svg viewBox="0 0 220 100" width={width} height={(width * 100) / 220} aria-hidden="true" className={className} style={style}>
      <g fill={shade}>
        <ellipse cx="110" cy="78" rx="100" ry="20" />
      </g>
      <g fill={tint}>
        <circle cx="62" cy="62" r="30" />
        <circle cx="104" cy="46" r="38" />
        <circle cx="150" cy="58" r="30" />
        <ellipse cx="108" cy="72" rx="94" ry="18" />
      </g>
      <ellipse cx="92" cy="34" rx="14" ry="7" fill="#fff" opacity="0.9" />
    </svg>
  );
}

// A four-point glint on the island's crystals.
export function Sparkle({ size = 22, delay = 0 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="overflow-visible">
      <path
        className="world-twinkle"
        style={{ animationDelay: `${delay}s` }}
        d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z"
        fill="#fff"
      />
    </svg>
  );
}

// An Andean condor gliding across the sky, as a navy silhouette.
export function Condor({ width = 64 }) {
  return (
    <svg viewBox="0 0 64 24" width={width} height={(width * 24) / 64} aria-hidden="true">
      <path
        d="M32 12 C26 6 16 4 2 8 C10 9 16 11 20 14 C24 14 28 15 32 18 C36 15 40 14 44 14 C48 11 54 9 62 8 C48 4 38 6 32 12Z"
        fill={INK}
      />
      <path d="M30 12.5 h4 v2.5 h-4z" fill="#fff" />
    </svg>
  );
}
