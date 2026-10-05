// The token coin: a gold star coin (chosen by the user on 2026-10-05). Large sizes use the
// illustrated coin (art/pipeline/build_coin.py -> public/coin.webp); below
// 48 px that image blurs, so the same coin is drawn as SVG with a bolder star.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 3.4 : 7.8;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(16 + r * Math.cos(a)).toFixed(2)},${(16.6 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

export function TokenCoin({ size = 20, className = '' }) {
  if (size >= 48) {
    return <img src="/coin.webp" width={size} height={size} alt="" draggable={false} className={`inline-block select-none ${className}`} />;
  }
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <circle cx="16" cy="16" r="14.6" fill="#F9C93B" stroke="#081633" strokeWidth="2.2" />
      <path d="M27.4 13.2a11.6 11.6 0 0 1-14.2 14" fill="none" stroke="#C98B1C" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="#C98B1C" strokeWidth="1.1" />
      <polygon points={STAR} fill="#FBDB69" stroke="#081633" strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="9.6" cy="9" rx="2.3" ry="1.4" transform="rotate(-35 9.6 9)" fill="#fff" opacity="0.85" />
    </svg>
  );
}

// An amount of tokens: coin + number (the word stays for screen readers).
export function Tokens({ value, size = 18, className = 'font-black text-gold' }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <TokenCoin size={size} />
      {value}
      <span className="sr-only"> tokens</span>
    </span>
  );
}
