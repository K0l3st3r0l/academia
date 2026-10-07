// The token coin: a gold coin stamped with an hourglass (chosen by the user on 2026-10-07, over
// the star coin of 2026-10-05; it comes from the Academia lobby). Large sizes use the
// illustrated coin (art/pipeline/build_coin.py -> public/coin.webp); below 48 px that image
// blurs, so the same coin is drawn as SVG with a bolder hourglass.
export function TokenCoin({ size = 20, className = '' }) {
  if (size >= 48) {
    return <img src="/coin.webp" width={size} height={size} alt="" draggable={false} className={`inline-block select-none ${className}`} />;
  }
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <circle cx="16" cy="16" r="14.6" fill="#F9C93B" stroke="#3B2314" strokeWidth="2.2" />
      <path d="M27.4 13.2a11.6 11.6 0 0 1-14.2 14" fill="none" stroke="#C98B1C" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="#C98B1C" strokeWidth="1.1" />
      <path d="M12 10.2h8l-3.1 5.8 3.1 5.8h-8l3.1-5.8z" fill="#FFF4CC" stroke="#3B2314" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M13.3 11.4h5.4L16 15.2z" fill="#D99A2B" />
      <path d="M16 18.6l2.8 3.2h-5.6z" fill="#D99A2B" />
      <rect x="10.4" y="8.4" width="11.2" height="2.2" rx="1" fill="#8A4B1C" stroke="#3B2314" strokeWidth="1.1" />
      <rect x="10.4" y="21.4" width="11.2" height="2.2" rx="1" fill="#8A4B1C" stroke="#3B2314" strokeWidth="1.1" />
      <ellipse cx="9" cy="9.4" rx="2.1" ry="1.3" transform="rotate(-35 9 9.4)" fill="#fff" opacity="0.85" />
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
