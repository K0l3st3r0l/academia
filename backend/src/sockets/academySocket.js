const jwt = require('jsonwebtoken');
const pool = require('../db');
const logger = require('../logger');
const { academyOpen } = require('../services/academy');

// Presence in the Academy lobby (namespace /academia). Everyone may see everyone, but in copies of
// the hall of at most CAP players: classmates go into the same copy first, and a new copy opens when
// they are full (2026-10-14: 300 in one hall is a crowd no tablet can draw). There is no chat: only
// positions and predefined gestures travel. A student playing in private simply does not connect.
const CAP = 30;
const TICK_MS = 100;
const MAX_STATES_PER_SECOND = 15;
const MAX_GESTURE = 50;          // index into the lobby's list of predefined phrases
const WORLD = { x: [0, 10000], y: [-500, 2000], v: 3000 };

const copies = new Map();        // copy id -> { players: Map(publicId -> player), dirty: Set(publicId) }
let nextCopy = 1;
let nextPlayer = 1;

const finite = (v, [lo, hi]) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

// Within a course, players see each other's first name; across courses, only a character name a
// teacher approved (minors: a stranger never sees a real name).
function labelFor(player, viewer) {
  if (player.course === viewer.course) return player.characterName || player.firstName;
  return player.characterName || 'Viajero';
}

function publicView(player, viewer) {
  return { id: player.id, name: labelFor(player, viewer), look: player.look, state: player.state };
}

function pickCopy(course) {
  let best = null;
  for (const [id, copy] of copies) {
    if (copy.players.size >= CAP) continue;
    const mates = [...copy.players.values()].filter(p => p.course === course).length;
    const score = mates * 1000 + copy.players.size;
    if (!best || score > best.score) best = { id, score };
  }
  if (best) return best.id;
  const id = nextCopy++;
  copies.set(id, { players: new Map(), dirty: new Set() });
  return id;
}

async function loadStudent(token) {
  const user = jwt.verify(token, process.env.JWT_SECRET);
  if (!user?.roles?.includes('student')) return null;
  const { rows: [row] } = await pool.query(
    `SELECT s.id, s.first_name, s.course_name, s.is_test, c.layers, c.name, c.name_status
     FROM local_students s LEFT JOIN characters c ON c.student_id = s.id
     WHERE s.id = $1 AND s.active`,
    [user.id]
  );
  if (!row || !(academyOpen() || row.is_test)) return null;
  const layers = row.layers || {};
  return {
    studentId: row.id,
    firstName: row.first_name.split(' ')[0],
    course: row.course_name,
    characterName: row.name_status === 'approved' ? row.name : null,
    look: { skinTone: layers.skinTone ?? null, topColor: layers.topColor ?? null, hairStyle: layers.hairStyle ?? null },
  };
}

function cleanState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = finite(raw.x, WORLD.x), y = finite(raw.y, WORLD.y);
  if (x === null || y === null) return null;
  return {
    x: Math.round(x), y: Math.round(y),
    vx: Math.round(finite(raw.vx, [-WORLD.v, WORLD.v]) ?? 0), vy: Math.round(finite(raw.vy, [-WORLD.v, WORLD.v]) ?? 0),
    face: raw.face < 0 ? -1 : 1,
    ground: raw.ground === true,
    flip: Math.round((finite(raw.flip, [0, 1]) ?? 0) * 100) / 100,
    map: typeof raw.map === 'string' ? raw.map.slice(0, 40) : '',
  };
}

function setupAcademySocket(io) {
  const ns = io.of('/academia');

  ns.use(async (socket, next) => {
    try {
      const student = await loadStudent(socket.handshake.auth?.token);
      if (!student) return next(new Error('La Academia no está abierta para ti.'));
      socket.data.student = student;
      next();
    } catch {
      next(new Error('Sesión inválida'));
    }
  });

  ns.on('connection', socket => {
    const student = socket.data.student;
    const copyId = pickCopy(student.course);
    const copy = copies.get(copyId);
    const player = { ...student, id: nextPlayer++, socketId: socket.id, state: null, stamps: [] };
    const room = `copia:${copyId}`;

    // The newcomer gets everyone already here; each of them gets the newcomer, named for them.
    socket.emit('academia:presentes', { copia: copyId, yo: player.id, jugadores: [...copy.players.values()].map(p => publicView(p, player)) });
    for (const other of copy.players.values()) ns.to(other.socketId).emit('academia:llega', publicView(player, other));
    copy.players.set(player.id, player);
    socket.join(room);

    socket.on('academia:estado', raw => {
      const now = Date.now();
      player.stamps = player.stamps.filter(t => now - t < 1000);
      if (player.stamps.length >= MAX_STATES_PER_SECOND) return;
      player.stamps.push(now);
      const state = cleanState(raw);
      if (!state) return;
      player.state = state;
      copy.dirty.add(player.id);
    });

    socket.on('academia:gesto', raw => {
      const i = Number(raw?.i);
      if (!Number.isInteger(i) || i < 0 || i >= MAX_GESTURE) return;
      socket.to(room).emit('academia:gesto', { id: player.id, i });
    });

    socket.on('disconnect', () => {
      copy.players.delete(player.id);
      copy.dirty.delete(player.id);
      ns.to(room).emit('academia:sale', { id: player.id });
      if (!copy.players.size) copies.delete(copyId);
    });
  });

  // Positions travel grouped, ten times a second, and only for those who moved.
  const timer = setInterval(() => {
    for (const [copyId, copy] of copies) {
      if (!copy.dirty.size) continue;
      const moves = [...copy.dirty].map(id => copy.players.get(id)).filter(Boolean).map(p => [p.id, p.state]);
      copy.dirty.clear();
      ns.to(`copia:${copyId}`).volatile.emit('academia:mueve', moves);
    }
  }, TICK_MS);
  timer.unref?.();
  logger.info('Academy presence ready');
  return { stop: () => clearInterval(timer), copies };
}

module.exports = { setupAcademySocket, CAP };
