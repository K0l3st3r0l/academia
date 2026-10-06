import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import CharacterView from '../character/CharacterView';
import PetView from '../pet/PetView';
import { INK } from './WorldParts';
import { canStand, decodeWalk, findPath, nearestStand, spotBeside } from './walk';

// The student's character walking the island, driven by the keyboard (arrows / WASD) or by
// tapping the path, with the pet tagging along and busy with its own things. Everything moves in
// island pixels; one animation frame loop writes positions straight to the DOM.
const CHAR_SCALE = 0.15; // character height, as a share of the island width
const PET_SCALE = 0.09;
const BUTTON_RADIUS = 0.0525; // a level button is 10.5% of the island wide (MapNode)
const SPEED = 250; // island pixels per second
const KEY_SPEED = 230;
const MAX_TRIP_S = 2.6; // long trips speed up so a tap never means a long wait
const PET_GAP = 80; // how far behind the character the pet trails
const NEAR = 130; // close enough to a level to enter it with Enter

const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

// What the pet does while the character stands still, with how often it picks each.
const PET_ACTIONS = [['wander', 30], ['sniff', 22], ['scratch', 14], ['look', 14], ['rest', 12], ['zoom', 8]];
const PET_CLASS = { trot: 'pet-trot', sniff: 'pet-sniff', scratch: 'pet-scratch' };

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function pickAction() {
  let roll = Math.random() * PET_ACTIONS.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, weight] of PET_ACTIONS) {
    roll -= weight;
    if (roll < 0) return name;
  }
  return 'rest';
}

// The point `gap` pixels back along the walked trail.
function trailPoint(trail, gap) {
  let left = gap;
  for (let i = trail.length - 1; i > 0; i--) {
    const d = dist(trail[i], trail[i - 1]);
    if (d >= left) {
      const t = left / d;
      return [trail[i][0] + (trail[i - 1][0] - trail[i][0]) * t, trail[i][1] + (trail[i - 1][1] - trail[i][1]) * t];
    }
    left -= d;
  }
  return trail[0];
}

const SHADOW = `radial-gradient(ellipse at center, ${INK}66 0%, ${INK}33 45%, transparent 72%)`;
const DUST = 'radial-gradient(circle, rgba(255, 244, 222, 0.95) 0%, rgba(240, 214, 170, 0.6) 45%, transparent 72%)';

function Figure({ figureRef, scaleRef, faceRef, moveRef, shadowWidth, children }) {
  return (
    <div ref={figureRef} className="absolute left-0 top-0 pointer-events-none" style={{ willChange: 'transform' }}>
      <div ref={scaleRef} className="relative" style={{ transformOrigin: '50% 100%' }}>
        <span
          className="absolute left-1/2 bottom-0 rounded-full"
          style={{ width: shadowWidth, height: shadowWidth * 0.3, transform: 'translate(-50%, 40%)', background: SHADOW }}
        />
        <div ref={faceRef} style={{ transformOrigin: '50% 100%' }}>
          <div ref={moveRef} style={{ transformOrigin: '50% 100%' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const Explorer = forwardRef(function Explorer(
  { island, width, look, pet, petCatalog, start, goal, stops, controls, onInteract, onRest },
  ref,
) {
  const grid = useMemo(() => decodeWalk(island.walk, island), [island]);
  const k = width / island.width;
  const charH = CHAR_SCALE * island.width;
  const petH = PET_SCALE * island.width;
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const [near, setNear] = useState(null);

  const charRefs = { figure: useRef(null), scale: useRef(null), face: useRef(null), move: useRef(null) };
  const petRefs = { figure: useRef(null), scale: useRef(null), face: useRef(null), move: useRef(null) };
  const puffRefs = useRef([]);
  const markerRef = useRef(null);
  const live = useRef({});
  live.current = { k, controls, stops, onInteract, onRest };

  const spots = useRef(new Map());
  const spotFor = level => {
    if (!spots.current.has(level.key)) {
      spots.current.set(level.key, spotBeside(grid, level.at, {
        body: [charH * 0.42, charH * 0.95],
        button: BUTTON_RADIUS * island.width,
        others: stops.filter(s => s.key !== level.key).map(s => s.at),
      }));
    }
    return spots.current.get(level.key);
  };

  const sim = useRef(null);
  if (!sim.current) {
    const at = nearestStand(grid, start) ?? start;
    const petAt = nearestStand(grid, [at[0] - 70, at[1] + 12]) ?? at;
    sim.current = {
      char: { x: at[0], y: at[1], path: [], speed: SPEED, onArrive: null, moving: false, lean: 0 },
      pet: { x: petAt[0], y: petAt[1], path: [], speed: SPEED, mode: 'idle', action: 'rest', until: 0, face: 1, flipAt: [] },
      trail: [petAt, at],
      keys: new Set(),
      keyboard: false,
      puff: 0,
      lastDust: 0,
      lastPetDust: 0,
      lastFollow: 0,
    };
  }

  const walkTo = (point, onArrive, { marker = false } = {}) => {
    const s = sim.current;
    const target = nearestStand(grid, point);
    if (!target) return;
    if (marker && markerRef.current) {
      const m = markerRef.current;
      m.style.left = `${(target[0] / island.width) * 100}%`;
      m.style.top = `${(target[1] / island.height) * 100}%`;
      m.animate(
        [{ transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 }],
        { duration: 650, easing: 'ease-out' },
      );
    }
    const c = s.char;
    if (reduced) {
      c.x = target[0];
      c.y = target[1];
      c.path = [];
      s.trail.push(target);
      onArrive?.();
      live.current.onRest?.(target);
      return;
    }
    const path = findPath(grid, [c.x, c.y], target);
    let length = 0;
    path.reduce((from, p) => { length += dist(from, p); return p; }, [c.x, c.y]);
    c.path = path;
    c.speed = Math.max(SPEED, length / MAX_TRIP_S);
    c.onArrive = onArrive ?? null;
  };

  useImperativeHandle(ref, () => ({
    walkTo,
    goToLevel: (level, onArrive) => walkTo(spotFor(level), onArrive),
  }));

  // The walk toward the level to play now, after a beat so the student sees where they were.
  useEffect(() => {
    if (!goal) return undefined;
    const level = stops.find(st => st.key === goal);
    if (!level) return undefined;
    const timer = setTimeout(() => walkTo(spotFor(level)), reduced ? 0 : 650);
    return () => clearTimeout(timer);
    // Only once, when the explorer appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = sim.current;
    const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    const onDown = e => {
      if (!live.current.controls || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEYS[e.code];
      if (dir) {
        e.preventDefault();
        s.keys.add(dir);
        s.keyboard = true;
        return;
      }
      const onButton = /^(BUTTON|A)$/.test(document.activeElement?.tagName ?? '');
      if ((e.key === 'Enter' || e.key === ' ') && !onButton) {
        const level = nearestStop();
        if (level) {
          e.preventDefault();
          live.current.onInteract(level);
        }
      }
    };
    const onUp = e => {
      const dir = KEYS[e.code];
      if (dir) s.keys.delete(dir);
    };
    const onPointer = () => { s.keyboard = false; };
    const onBlur = () => s.keys.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('blur', onBlur);
    };
    // nearestStop reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!controls) sim.current.keys.clear();
  }, [controls]);

  function nearestStop() {
    const c = sim.current.char;
    let best = null;
    let bestDist = NEAR;
    for (const level of live.current.stops) {
      const d = dist([c.x, c.y], level.at);
      if (d < bestDist) {
        best = level;
        bestDist = d;
      }
    }
    return best;
  }

  useEffect(() => {
    const s = sim.current;
    const [top, bottom] = [island.challenge.at[1], island.entry[1]];
    const depth = y => 0.8 + 0.2 * Math.min(1, Math.max(0, (y - top) / (bottom - top)));
    let frame = 0;
    let last = performance.now();
    let nearKey = null;

    const dust = (x, y, size) => {
      const el = puffRefs.current[s.puff++ % puffRefs.current.length];
      if (!el || reduced) return;
      const kk = live.current.k;
      el.style.width = el.style.height = `${size * kk}px`;
      el.style.left = `${x * kk}px`;
      el.style.top = `${y * kk}px`;
      el.style.zIndex = String(99 + Math.round(y / 4));
      el.animate(
        [
          { opacity: 0.85, transform: 'translate(-50%, -50%) scale(0.4)' },
          { opacity: 0, transform: `translate(${rand(-60, -40)}%, -110%) scale(1.5)` },
        ],
        { duration: 520 + Math.random() * 200, easing: 'ease-out' },
      );
    };

    // Moves a walker along its path; true while it is moving.
    const advance = (w, dt) => {
      if (!w.path.length) return false;
      const [tx, ty] = w.path[0];
      const d = Math.hypot(tx - w.x, ty - w.y);
      const v = w.speed * dt;
      if (Math.abs(tx - w.x) > 1) w.dir = Math.sign(tx - w.x);
      if (d <= v) {
        w.x = tx;
        w.y = ty;
        w.path.shift();
      } else {
        w.x += ((tx - w.x) / d) * v;
        w.y += ((ty - w.y) / d) * v;
      }
      return true;
    };

    const place = (refs, x, y) => {
      const kk = live.current.k;
      refs.figure.current.style.transform = `translate3d(${x * kk}px, ${y * kk}px, 0)`;
      refs.figure.current.style.zIndex = String(100 + Math.round(y / 4));
      refs.scale.current.style.transform = `translate(-50%, -100%) scale(${depth(y).toFixed(3)})`;
    };

    const setClass = (el, name) => {
      if (el && el.dataset.anim !== name) {
        el.className = name;
        el.dataset.anim = name;
      }
    };

    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = s.char;
      const p = s.pet;
      const wasMoving = c.moving;

      // Character: held keys win over a walk in progress.
      let moving = false;
      if (live.current.controls && s.keys.size) {
        const dx = s.keys.has('right') - s.keys.has('left');
        const dy = s.keys.has('down') - s.keys.has('up');
        if (dx || dy) {
          c.path = [];
          c.onArrive = null;
          const v = (KEY_SPEED * dt) / Math.hypot(dx, dy);
          const nx = c.x + dx * v;
          const ny = c.y + dy * v * 0.85;
          if (canStand(grid, [nx, ny])) [c.x, c.y] = [nx, ny];
          else if (dx && canStand(grid, [nx, c.y])) c.x = nx;
          else if (dy && canStand(grid, [c.x, ny])) c.y = ny;
          if (dx) c.dir = dx;
          moving = true;
        }
      }
      if (!moving && c.path.length) {
        moving = advance(c, dt);
        if (!c.path.length && c.onArrive) {
          const done = c.onArrive;
          c.onArrive = null;
          done();
        }
      }
      c.moving = moving;
      if (moving && dist(s.trail[s.trail.length - 1], [c.x, c.y]) > 6) {
        s.trail.push([c.x, c.y]);
        if (s.trail.length > 120) s.trail.shift();
      }
      if (moving && now - s.lastDust > 140) {
        s.lastDust = now;
        dust(c.x + rand(-8, 8), c.y, 26);
      }
      if (wasMoving && !moving) live.current.onRest?.([Math.round(c.x), Math.round(c.y)]);

      // Keep the character on screen while the keyboard drives it.
      if (moving && s.keyboard && charRefs.figure.current) {
        const y = charRefs.figure.current.getBoundingClientRect().top;
        const h = window.innerHeight;
        if (y < h * 0.3) window.scrollBy(0, (y - h * 0.3) * 0.15);
        else if (y > h * 0.75) window.scrollBy(0, (y - h * 0.75) * 0.15);
      }

      // Pet: follows when the character goes, keeps busy when it stays.
      const gap = dist([p.x, p.y], [c.x, c.y]);
      if (moving || gap > 170) p.mode = 'follow';
      if (p.mode === 'follow') {
        if (now - s.lastFollow > 220 || !p.path.length) {
          s.lastFollow = now;
          const target = nearestStand(grid, trailPoint(s.trail, PET_GAP));
          if (target && dist(target, [p.x, p.y]) > 4) p.path = findPath(grid, [p.x, p.y], target);
        }
        p.speed = gap > 220 ? SPEED * 1.7 : SPEED * 1.1;
        p.action = 'trot';
        if (!advance(p, dt) && !moving) {
          p.mode = 'idle';
          p.action = 'rest';
          p.until = now + rand(300, 900);
        }
      } else if (p.path.length) {
        advance(p, dt);
      } else if (now >= p.until) {
        const action = reduced ? 'rest' : pickAction();
        p.action = action;
        p.flipAt = [];
        if (action === 'wander') {
          const angle = rand(0, Math.PI * 2);
          const radius = rand(60, 150);
          const target = nearestStand(grid, [c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius * 0.6]);
          if (target && dist(target, [c.x, c.y]) > 45) {
            p.path = findPath(grid, [p.x, p.y], target);
            p.speed = rand(90, 130);
          }
          p.until = now + 200;
        } else if (action === 'zoom') {
          const start = Math.atan2(p.y - c.y, p.x - c.x);
          const turn = Math.random() < 0.5 ? 1 : -1;
          let from = [p.x, p.y];
          p.path = [];
          for (let i = 1; i <= 7; i++) {
            const a = start + turn * (i * Math.PI * 2) / 7;
            const target = nearestStand(grid, [c.x + Math.cos(a) * 105, c.y + Math.sin(a) * 60]);
            if (!target) continue;
            p.path.push(...findPath(grid, from, target));
            from = target;
          }
          p.speed = SPEED * 1.5;
          p.until = now + 300;
        } else if (action === 'look') {
          p.until = now + rand(1300, 2000);
          p.flipAt = [now + 400, now + 900, now + 1400];
        } else {
          p.until = now + (action === 'rest' ? rand(500, 1200) : action === 'sniff' ? rand(1500, 2600) : rand(900, 1500));
        }
      }
      if (p.flipAt.length && now >= p.flipAt[0]) {
        p.flipAt.shift();
        p.face *= -1;
      }
      const petMoving = p.path.length > 0;
      if (petMoving && p.dir) p.face = p.dir > 0 ? -1 : 1; // the pets are drawn with the head to the left
      const petDust = petMoving ? 200 : p.action === 'sniff' ? 450 : 0;
      if (petDust && now - s.lastPetDust > petDust) {
        s.lastPetDust = now;
        // Trotting kicks up dust at the feet; sniffing, little puffs in front of the nose.
        if (petMoving) dust(p.x, p.y, 16);
        else dust(p.x - p.face * 30, p.y - 4, 10);
      }

      // Draw.
      place(charRefs, c.x, c.y);
      c.lean += ((moving ? (c.dir ?? 0) * 5 : 0) - c.lean) * Math.min(1, dt * 10);
      charRefs.face.current.style.transform = `rotate(${c.lean.toFixed(2)}deg)`;
      setClass(charRefs.move.current, moving ? 'world-walk' : 'animate-breathe');
      if (petRefs.figure.current) {
        place(petRefs, p.x, p.y);
        petRefs.face.current.style.transform = `scaleX(${p.face})`;
        setClass(petRefs.move.current, petMoving ? PET_CLASS.trot : PET_CLASS[p.action] ?? '');
      }

      const close = nearestStop();
      const key = close && !moving ? close.key : null;
      if (key !== nearKey) {
        nearKey = key;
        setNear(key);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The loop reads changing props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  const nearLevel = near && sim.current.keyboard ? stops.find(st => st.key === near) : null;
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          ref={el => { puffRefs.current[i] = el; }}
          className="absolute left-0 top-0 rounded-full pointer-events-none opacity-0"
          style={{ background: DUST }}
        />
      ))}
      <span
        ref={markerRef}
        aria-hidden="true"
        className="absolute rounded-[50%] pointer-events-none opacity-0"
        style={{ width: 70 * k, height: 34 * k, border: `${Math.max(2, 5 * k)}px solid #fff`, boxShadow: `0 0 0 2px ${INK}55`, zIndex: 99 }}
      />
      {pet && (
        <Figure figureRef={petRefs.figure} scaleRef={petRefs.scale} faceRef={petRefs.face} moveRef={petRefs.move} shadowWidth={petH * k * 0.75}>
          <PetView species={pet.species} stage={pet.stage} size={petH * k} catalog={petCatalog} label={pet.name} />
        </Figure>
      )}
      <Figure figureRef={charRefs.figure} scaleRef={charRefs.scale} faceRef={charRefs.face} moveRef={charRefs.move} shadowWidth={charH * k * 0.42}>
        <CharacterView look={look} size={charH * k} label="Tu personaje" />
      </Figure>
      {nearLevel && controls && (
        <span
          className="absolute -translate-x-1/2 px-2 py-0.5 rounded-full text-xs font-black text-white whitespace-nowrap pointer-events-none"
          style={{
            left: `${(nearLevel.at[0] / island.width) * 100}%`,
            top: `${((nearLevel.at[1] - 1.9 * BUTTON_RADIUS * island.width) / island.height) * 100}%`,
            background: INK,
            zIndex: 600,
          }}
        >
          Enter ↵ para jugar
        </span>
      )}
    </>
  );
});

export default Explorer;
