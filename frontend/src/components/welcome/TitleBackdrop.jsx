import { useEffect, useRef, useState } from 'react';

// Night over the Atacama island of the world map, as a game title screen. The picture is still;
// what moves is drawn on top of it at points picked by hand on the source pixels
// (art/incoming/portada/*.png, see art/pipeline/build_portada.py). A new picture needs new points.
// glows: [x, y, radius] of warm light (observatory, lanterns).
const ART = {
  wide: {
    name: 'fondo-ancho',
    w: 1536,
    h: 1024,
    widths: [960, 1536],
    stars: [[415, 93], [150, 98], [493, 50], [623, 24], [601, 190], [789, 284], [904, 84], [937, 254],
      [1061, 13], [1061, 332], [1083, 204], [1197, 61], [1286, 296], [1318, 22], [1495, 62]],
    crystals: [[22, 705], [146, 723], [240, 885], [382, 258], [436, 668], [475, 322], [520, 657], [565, 402],
      [640, 628], [712, 570], [1105, 726], [1160, 642], [1270, 660], [1362, 770], [1448, 345]],
    glows: [[1340, 432, 55], [1405, 492, 30], [1357, 503, 18], [1465, 537, 18]],
    shimmer: [[130, 455], [250, 505], [330, 425], [380, 380], [420, 470]],
    meteors: [[180, 30], [640, 120], [1000, 20]],
  },
  tall: {
    name: 'fondo-alto',
    w: 1024,
    h: 1536,
    widths: [640, 1024],
    stars: [[83, 78], [105, 419], [108, 278], [270, 497], [282, 425], [343, 182], [371, 313], [443, 113],
      [493, 309], [562, 114], [648, 363], [702, 86], [844, 479], [930, 155], [935, 330], [943, 57]],
    crystals: [[95, 790], [140, 1195], [146, 1049], [253, 1303], [290, 1250], [310, 1336], [494, 1386],
      [654, 1178], [790, 1105], [811, 1249], [831, 1063], [930, 1258], [932, 919]],
    glows: [[665, 835, 50], [795, 885, 35], [630, 905, 18], [65, 770, 14], [155, 790, 14], [860, 1050, 14],
      [985, 1050, 14]],
    shimmer: [[470, 990], [520, 1030], [600, 1085], [650, 1020], [700, 1080]],
    meteors: [[60, 140], [420, 40], [240, 380]],
  },
};

// Rising sparks: [left %, size px, seconds, gold?]. Spread by hand so they never bunch up.
const MOTES = [[4, 4, 19, true], [11, 3, 24, false], [19, 5, 16, false], [27, 3, 22, true], [36, 4, 26, false],
  [44, 3, 18, true], [53, 5, 23, false], [61, 3, 17, true], [69, 4, 25, false], [77, 3, 20, true],
  [85, 5, 15, false], [93, 3, 21, true]];

// Banks of mist drifting in front of the scene, in the lavender of the painted clouds.
const MIST = [
  { left: '-18%', bottom: '-9%', width: '62%', height: '30%', delay: 0 },
  { right: '-22%', bottom: '-11%', width: '66%', height: '32%', delay: -11 },
  { left: '22%', bottom: '-15%', width: '56%', height: '24%', delay: -19, wideOnly: true },
];
const MIST_FILL = 'radial-gradient(ellipse at center, rgba(205, 190, 255, 0.5) 0%, rgba(160, 140, 235, 0.28) 38%, transparent 70%)';

const WIDE_QUERY = '(min-aspect-ratio: 1/1)';
const STAR_PATH = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z';

function useMatch(query) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Deterministic spread of delays and durations, so every visit looks the same and nothing syncs up.
const delay = (i, span) => `${-((i * 1.618) % span).toFixed(2)}s`;

// size, in picture pixels, makes the spot scale with the picture.
function At({ art, x, y, size, children }) {
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${(x / art.w) * 100}%`,
        top: `${(y / art.h) * 100}%`,
        ...(size && { width: `${(size / art.w) * 100}%`, aspectRatio: '1' }),
      }}
    >
      {children}
    </span>
  );
}

function Twinkle({ size, i, span = 4.5, color = '#FFF6D8' }) {
  return (
    <span
      className="title-twinkle block rounded-full"
      style={{
        width: size,
        height: size,
        animationDuration: `${span + (i % 3) * 0.9}s`,
        animationDelay: delay(i, span),
        background: 'radial-gradient(circle, rgba(255,230,160,0.55) 0%, transparent 62%)',
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path d={STAR_PATH} fill={color} transform="translate(5 5) scale(0.58)" />
      </svg>
    </span>
  );
}

function Glow({ i, color, className, span }) {
  return (
    <span
      className={`${className} block w-full h-full rounded-full`}
      style={{
        animationDuration: `${span + (i % 4) * 0.7}s`,
        animationDelay: delay(i, span),
        background: color,
      }}
    />
  );
}

const CRYSTAL_GLOW = 'radial-gradient(circle, rgba(233,213,255,0.9) 0%, rgba(192,132,252,0.55) 28%, rgba(147,51,234,0.18) 50%, transparent 70%)';
const WARM_GLOW = 'radial-gradient(circle, rgba(255,240,190,0.85) 0%, rgba(245,200,66,0.45) 32%, rgba(245,170,40,0.12) 52%, transparent 70%)';

export default function TitleBackdrop() {
  const wide = useMatch(WIDE_QUERY);
  const reduced = useMatch('(prefers-reduced-motion: reduce)');
  const finePointer = useMatch('(pointer: fine)');
  const art = wide ? ART.wide : ART.tall;
  const [loadedName, setLoadedName] = useState(null);
  const loaded = loadedName === art.name;
  const rootRef = useRef(null);
  const imgRef = useRef(null);

  // A cached picture can finish before React listens for its load event.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth) setLoadedName(art.name);
  }, [art.name]);

  // The scene leans a little away from the mouse: the far art less, the near clouds more.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reduced || !finePointer) return undefined;
    let frame = 0;
    const onMove = e => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [reduced, finePointer]);

  const base = `/portada/${art.name}`;
  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      style={{ background: 'linear-gradient(#0B1446 0%, #1E2C7C 45%, #6D62D3 78%, #9C85F5 100%)' }}
    >
      <div className="title-parallax absolute inset-0" style={{ '--depth': '14px' }}>
        {/* Sized like object-fit: cover, so the overlay points stay on their spot of the picture. */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: `max(100vw, ${(100 * art.w) / art.h}vh)`, height: `max(100vh, ${(100 * art.h) / art.w}vw)` }}
        >
          <div className={`title-pan absolute inset-0 transition-opacity duration-1000 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
            <img
              key={art.name}
              ref={imgRef}
              src={`${base}-${art.widths[1]}.webp`}
              srcSet={art.widths.map(width => `${base}-${width}.webp ${width}w`).join(', ')}
              sizes="100vw"
              alt=""
              fetchpriority="high"
              decoding="async"
              onLoad={() => setLoadedName(art.name)}
              className="absolute inset-0 w-full h-full"
              draggable="false"
            />
            {art.crystals.map(([x, y], i) => (
              <At key={`c${i}`} art={art} x={x} y={y} size={70}>
                <Glow i={i} color={CRYSTAL_GLOW} className="title-glow" span={3.2} />
              </At>
            ))}
            {art.glows.map(([x, y, r], i) => (
              <At key={`g${i}`} art={art} x={x} y={y} size={r * 2.6}>
                <Glow i={i} color={WARM_GLOW} className="title-flicker" span={2.8} />
              </At>
            ))}
            {art.stars.map(([x, y], i) => (
              <At key={`s${i}`} art={art} x={x} y={y}>
                <Twinkle size={i % 3 === 0 ? 30 : 22} i={i} />
              </At>
            ))}
            {art.shimmer.map(([x, y], i) => (
              <At key={`w${i}`} art={art} x={x} y={y}>
                <Twinkle size={16} i={i + 2} span={2.4} color="#FFFFFF" />
              </At>
            ))}
            {art.meteors.map(([x, y], i) => (
              <span
                key={`m${i}`}
                className="absolute"
                style={{ left: `${(x / art.w) * 100}%`, top: `${(y / art.h) * 100}%` }}
              >
                <span
                  className="title-meteor block h-[2px] w-32 rounded-full"
                  style={{
                    animationDuration: `${9 + i * 4}s`,
                    animationDelay: `${2 + i * 3.5}s`,
                    background: 'linear-gradient(to right, transparent, rgba(255,246,216,0.95))',
                    boxShadow: '0 0 8px rgba(255,230,160,0.8)',
                  }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Keeps the logo and the menu readable without hiding the scene around them. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 34rem 75% at 50% 45%, rgba(11,10,40,0.55) 0%, rgba(11,10,40,0.2) 55%, transparent 80%), linear-gradient(to bottom, rgba(11,10,40,0.35), transparent 22%)',
        }}
      />

      {MOTES.map(([left, size, span, gold], i) => (
        <span
          key={`p${i}`}
          className="title-rise absolute bottom-0 rounded-full"
          style={{
            left: `${left}%`,
            width: size,
            height: size,
            animationDuration: `${span}s`,
            animationDelay: delay(i, span),
            background: gold ? '#FDE68A' : '#D8B4FE',
            boxShadow: `0 0 ${size * 3}px ${gold ? 'rgba(245,200,66,0.9)' : 'rgba(192,132,252,0.9)'}`,
          }}
        />
      ))}

      <div className="title-parallax absolute inset-0" style={{ '--depth': '34px' }}>
        {MIST.filter(m => wide || !m.wideOnly).map(({ wideOnly, delay: d, ...place }, i) => (
          <div
            key={`f${i}`}
            className="world-drift absolute"
            style={{ ...place, animationDelay: `${d}s`, background: MIST_FILL }}
          />
        ))}
      </div>
    </div>
  );
}
