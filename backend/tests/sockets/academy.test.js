import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { startTestServer } from '../helpers/socketServer.js';
import { createStudent, signToken, studentPayload } from '../helpers/fixtures.js';

const { default: pool } = await import('../../src/db/index.js');
const { CAP } = await import('../../src/sockets/academySocket.js');

let srv;
const clients = [];
beforeAll(async () => { srv = await startTestServer(); });
afterAll(async () => { await srv.close(); });
afterEach(() => { while (clients.length) clients.pop().close(); });

// While the Academy is closed (shared/academy/config.json) only test accounts may come in.
async function tester({ course = '5° Básico A', firstName = 'Ana', character = null } = {}) {
  const row = await createStudent(pool, { courseName: course, firstName, isTest: true });
  if (character) {
    await pool.query(
      "INSERT INTO characters (student_id, layers, name, name_status) VALUES ($1, $2, $3, $4)",
      [row.id, JSON.stringify({ skinTone: 'piel-3', topColor: 'arriba-color-2', hairStyle: 'pelo-cola' }), character.name, character.status]
    );
  }
  return row;
}

function join(row) {
  const socket = ioClient(`${srv.url}/academia`, { auth: { token: signToken(studentPayload(row)) }, transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('academia:presentes', data => resolve({ socket, ...data }));
    socket.once('connect_error', reject);
  });
}
const next = (socket, event) => new Promise(resolve => socket.once(event, resolve));

describe('presencia en la Academia', () => {
  it('dos compañeros del curso se ven, con su nombre, y ven moverse al otro', async () => {
    const ana = await join(await tester({ firstName: 'Ana María' }));
    const arrives = next(ana.socket, 'academia:llega');
    const leo = await join(await tester({ firstName: 'Leo' }));
    expect(leo.copia).toBe(ana.copia);
    expect(leo.jugadores).toEqual([expect.objectContaining({ id: ana.yo, name: 'Ana' })]);
    expect(await arrives).toMatchObject({ id: leo.yo, name: 'Leo' });

    const moved = next(ana.socket, 'academia:mueve');
    leo.socket.emit('academia:estado', { x: 1200, y: 780, vx: 240, vy: 0, face: -1, ground: true, flip: 0, map: 'academia' });
    const moves = await moved;
    expect(moves).toEqual([[leo.yo, { x: 1200, y: 780, vx: 240, vy: 0, face: -1, ground: true, flip: 0, map: 'academia' }]]);
  });

  it('entre cursos no se ve el nombre real: el del personaje aprobado o «Viajero»', async () => {
    const ana = await join(await tester({ firstName: 'Ana' }));
    const first = next(ana.socket, 'academia:llega');
    await join(await tester({ course: '6° Básico A', firstName: 'Tomás', character: { name: 'Cóndor Sabio', status: 'approved' } }));
    expect((await first).name).toBe('Cóndor Sabio');
    const second = next(ana.socket, 'academia:llega');
    await join(await tester({ course: '6° Básico A', firstName: 'Sofía', character: { name: 'Puma Veloz', status: 'pending' } }));
    expect((await second).name).toBe('Viajero');
  });

  it('los gestos son predefinidos: solo viaja su número', async () => {
    const ana = await join(await tester());
    const leo = await join(await tester({ firstName: 'Leo' }));
    const gesture = next(ana.socket, 'academia:gesto');
    leo.socket.emit('academia:gesto', { i: 'hola, te escribo' });
    leo.socket.emit('academia:gesto', { i: 2 });
    expect(await gesture).toEqual({ id: leo.yo, i: 2 });
  });

  it('al salir, los demás dejan de verlo', async () => {
    const ana = await join(await tester());
    const leo = await join(await tester({ firstName: 'Leo' }));
    const gone = next(ana.socket, 'academia:sale');
    leo.socket.close();
    expect(await gone).toEqual({ id: leo.yo });
  });

  it('una copia se llena a los 30 y el siguiente abre otra', async () => {
    const first = await join(await tester({ firstName: 'Uno' }));
    const rest = [];
    for (let i = 1; i < CAP; i += 1) rest.push(await join(await tester({ firstName: `N${i}` })));
    expect(rest.every(p => p.copia === first.copia)).toBe(true);
    const extra = await join(await tester({ firstName: 'Extra' }));
    expect(extra.copia).not.toBe(first.copia);
    expect(extra.jugadores).toEqual([]);
  });

  it('sin sesión de alumno, o con la Academia cerrada para él, no entra', async () => {
    const real = await createStudent(pool, { courseName: '5° Básico A' });
    await expect(join(real)).rejects.toThrow(/no está abierta/);
    const bad = ioClient(`${srv.url}/academia`, { auth: { token: 'x' }, transports: ['websocket'], forceNew: true });
    clients.push(bad);
    await expect(new Promise((resolve, reject) => { bad.once('connect', resolve); bad.once('connect_error', reject); })).rejects.toThrow(/Sesión inválida/);
  });
});
