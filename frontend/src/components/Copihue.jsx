// The copihue: recognition currency (tokens reward effort). Drawn as the national flower itself,
// red, not as a coin, so it never reads as a second gold token, at any size.
const INK = '#1A1A2E';

export function CopihueIcon({ size = 20, className = '' }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <path d="M16 9.6c-.2-2.8.4-5.2 1.6-7.6" fill="none" stroke="#3E8E5A" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.4 3.6c3-2.8 8.6-3 11.4 0-3.2 2.6-8.4 2.8-11.4 0z" fill="#14B8A6" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path
        d="M13.4 10.4C11.6 15 10.2 20.4 5.6 27.4c2.2.8 4.2.2 5.6-.9 1.4 1.5 3 2.5 4.8 2.9 1.8-.4 3.4-1.4 4.8-2.9 1.4 1.1 3.4 1.7 5.6.9-4.6-7-6-12.4-7.8-17z"
        fill="#E0384B" stroke={INK} strokeWidth="1.7" strokeLinejoin="round"
      />
      <path d="M17.6 11.4l1-1c1.8 4.6 3.2 10 7.8 17-2.2.8-4.2.2-5.6-.9z" fill="#B42335" />
      <path d="M14.8 12.2l-3.6 14.3M17.2 12.2l3.6 14.3" stroke="#8E1828" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M12.9 14.4c-.8 2.6-1.6 5-2.8 7.6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
      <path d="M12.8 11c.9-1.6 2-2.4 3.2-2.4s2.3.8 3.2 2.4c-1 .7-2.1 1-3.2 1s-2.2-.3-3.2-1z" fill="#14B8A6" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// An amount of copihues: flower + number (the word stays for screen readers).
export function Copihues({ value, size = 18, className = 'font-black text-[#FF6B7A]' }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <CopihueIcon size={size} />
      {value}
      <span className="sr-only"> copihues</span>
    </span>
  );
}

export const COPIHUE_REASONS = {
  teacher: 'Reconocimiento',
  level_perfect: 'Nivel perfecto',
  challenge: 'Desafío ganado',
  streak: 'Días seguidos',
};
