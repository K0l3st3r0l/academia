import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, signToken, studentPayload, teacherPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { accrue, WEEK_MS, ECONOMY } = await import('../../src/services/academy.js');

async function student(tokensBalance = 0) {
  const row = await createStudent(pool, { courseName: '5° Básico A', firstName: 'Ana María', tokensBalance });
  const auth = `Bearer ${signToken(studentPayload(row))}`;
  const call = (method, url, body) => request(app)[method](`/api/academy${url}`).set('Authorization', auth).send(body);
  return { row, call };
}
const balances = async id => (await pool.query(
  'SELECT tokens_balance AS tokens, copihues_balance AS copihues FROM local_students WHERE id = $1', [id])).rows[0];
const ALL_SPARKS = ECONOMY.sparks;

describe('Academia: partida y apertura', () => {
  it('parte vacía, con los saldos reales y sin haber visto la apertura', async () => {
    const s = await student(12);
    const res = await s.call('get', '/me');
    expect(res.status).toBe(200);
    expect(res.body.snapshot).toMatchObject({
      firstName: 'Ana', tokens: 12, copihues: 0, items: [], chests: [], bank: { balance: 0 }, introSeenAt: null, practiceLeft: 3,
    });
  });

  it('guarda la exploración pero nunca la billetera que manda el juego', async () => {
    const s = await student(5);
    const state = { sparks: ['spark-1'], flags: { metEstela: true }, tokens: 9999, items: [{ id: 'capa' }], bank: { balance: 500 } };
    expect((await s.call('put', '/me/state', { state })).status).toBe(200);
    const { snapshot } = (await s.call('get', '/me')).body;
    expect(snapshot.state).toEqual({ sparks: ['spark-1'], flags: { metEstela: true } });
    expect(snapshot).toMatchObject({ tokens: 5, items: [], bank: { balance: 0 } });
    expect((await s.call('put', '/me/state', { state: 'hola' })).status).toBe(400);
  });

  it('marca la apertura como vista una sola vez', async () => {
    const s = await student();
    const first = (await s.call('post', '/me/intro-seen')).body.snapshot.introSeenAt;
    expect(first).toBeTruthy();
    expect((await s.call('post', '/me/intro-seen')).body.snapshot.introSeenAt).toBe(first);
  });

  it('al terminar la apertura regala tokens para estrenar la tienda, una sola vez', async () => {
    const s = await student(4);
    expect((await s.call('get', '/me')).body.snapshot).toMatchObject({ tokens: 4, welcomeGift: 0 });
    expect((await s.call('post', '/me/intro-seen')).body.snapshot).toMatchObject({ tokens: 34, welcomeGift: 30 });
    expect((await s.call('post', '/me/intro-seen')).body.snapshot.tokens).toBe(34);
    const { rows } = await pool.query("SELECT amount FROM token_ledger WHERE student_id = $1 AND reason = 'academy_welcome'", [s.row.id]);
    expect(rows).toEqual([{ amount: 30 }]);
  });

  it('mientras está cerrada, solo las cuentas de prueba la ven abierta', async () => {
    const real = await student();
    expect((await real.call('get', '/me')).body.snapshot.open).toBe(false);
    const row = await createStudent(pool, { courseName: '5° Básico A', isTest: true });
    const res = await request(app).get('/api/academy/me').set('Authorization', `Bearer ${signToken(studentPayload(row))}`);
    expect(res.body.snapshot.open).toBe(true);
  });

  it('solo para alumnos', async () => {
    const t = await createTeacher(pool, { roles: ['teacher'] });
    const res = await request(app).get('/api/academy/me').set('Authorization', `Bearer ${signToken(teacherPayload(t))}`);
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/academy/me')).status).toBe(401);
  });
});

describe('Academia: tienda con tokens y copihues reales', () => {
  it('compra con tokens, deja registro y no permite comprar dos veces', async () => {
    const s = await student(30);
    const res = await s.call('post', '/shop/buy', { itemId: 'sombrero' });
    expect(res.status).toBe(200);
    expect(res.body.snapshot.tokens).toBe(10);
    expect(res.body.snapshot.items).toEqual([{ id: 'sombrero', name: 'Sombrero de explorador', text: 'Para salir a descubrir.' }]);
    const { rows } = await pool.query('SELECT amount, reason FROM token_ledger WHERE student_id = $1', [s.row.id]);
    expect(rows).toEqual([{ amount: -20, reason: 'academy_shop' }]);
    expect((await s.call('post', '/shop/buy', { itemId: 'sombrero' })).status).toBe(409);
  });

  it('rechaza sin saldo suficiente sin tocar nada', async () => {
    const s = await student(5);
    const res = await s.call('post', '/shop/buy', { itemId: 'capa' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/más tokens/);
    expect(await balances(s.row.id)).toEqual({ tokens: 5, copihues: 0 });
    expect((await s.call('get', '/me')).body.snapshot.items).toEqual([]);
  });

  it('la colección copihue se paga con copihues y vender devuelve la mitad', async () => {
    const s = await student(0);
    await pool.query('UPDATE local_students SET copihues_balance = 3 WHERE id = $1', [s.row.id]);
    expect((await s.call('post', '/shop/buy', { itemId: 'manta' })).body.snapshot.copihues).toBe(0);
    expect((await s.call('post', '/shop/sell', { itemId: 'manta' })).body.snapshot.copihues).toBe(1);
    expect((await s.call('post', '/shop/sell', { itemId: 'manta' })).status).toBe(404);
  });

  it('un objeto desconocido no existe', async () => {
    const s = await student(100);
    expect((await s.call('post', '/shop/buy', { itemId: 'dragon' })).status).toBe(404);
  });
});

describe('Academia: cofres', () => {
  it('pagan una sola vez, con su recuerdo y su copihue', async () => {
    const s = await student(0);
    const res = await s.call('post', '/chests/high-chest/open');
    expect(res.status).toBe(200);
    expect(res.body.snapshot).toMatchObject({ tokens: 15, copihues: 1, chests: ['high-chest'] });
    expect(res.body.snapshot.items.map(i => i.id)).toEqual(['medallon']);
    expect((await s.call('post', '/chests/high-chest/open')).status).toBe(409);
    expect(await balances(s.row.id)).toEqual({ tokens: 15, copihues: 1 });
  });

  it('el cofre de las chispas exige las doce, también las que llegan con el pedido', async () => {
    const s = await student(0);
    expect((await s.call('post', '/chests/spark-chest/open', { sparks: ALL_SPARKS.slice(0, 11) })).status).toBe(403);
    const res = await s.call('post', '/chests/spark-chest/open', { sparks: [...ALL_SPARKS, 'inventada'] });
    expect(res.status).toBe(200);
    expect(res.body.snapshot.tokens).toBe(20);
    expect(res.body.snapshot.state.sparks).toHaveLength(ALL_SPARKS.length);
  });

  it('los recuerdos de cofre no se venden', async () => {
    const s = await student(0);
    await s.call('post', '/chests/high-chest/open');
    expect((await s.call('post', '/shop/sell', { itemId: 'medallon' })).status).toBe(404);
  });
});

describe('Academia: banco de Tempo', () => {
  it('deposita y retira tokens reales', async () => {
    const s = await student(50);
    expect((await s.call('post', '/bank', { amount: 40 })).body.snapshot).toMatchObject({ tokens: 10, bank: { balance: 40 } });
    expect((await s.call('post', '/bank', { amount: 41, withdraw: true })).status).toBe(400);
    expect((await s.call('post', '/bank', { amount: 15, withdraw: true })).body.snapshot).toMatchObject({ tokens: 25, bank: { balance: 25 } });
    expect((await s.call('post', '/bank', { amount: 26 })).status).toBe(400);
    expect((await s.call('post', '/bank', { amount: 1.5 })).status).toBe(400);
  });

  it('paga interés por semanas completas, con tope de 10', async () => {
    const s = await student(0);
    await s.call('get', '/me');
    await pool.query("UPDATE academy_progress SET bank_balance = 100, bank_last_week = NOW() - INTERVAL '15 days' WHERE student_id = $1", [s.row.id]);
    expect((await s.call('get', '/me')).body.snapshot).toMatchObject({ bank: { balance: 110 }, interest: 10 });
    expect((await s.call('get', '/me')).body.snapshot).toMatchObject({ bank: { balance: 110 }, interest: 0 });
  });

  it('el interés sigue la misma regla que el juego', () => {
    expect(accrue(100, 0, WEEK_MS * 2)).toEqual({ balance: 110, lastWeek: WEEK_MS * 2, earned: 10 });
    expect(accrue(300, 0, WEEK_MS * 3 + 5)).toEqual({ balance: 330, lastWeek: WEEK_MS * 3, earned: 30 });
    expect(accrue(19, 0, WEEK_MS * 4)).toEqual({ balance: 19, lastWeek: WEEK_MS * 4, earned: 0 });
    expect(accrue(40, 10, 5)).toEqual({ balance: 40, lastWeek: 10, earned: 0 });
  });
});

describe('Academia: práctica', () => {
  it('paga 2 tokens hasta tres veces por día', async () => {
    const s = await student(0);
    for (let i = 0; i < 3; i += 1) expect((await s.call('post', '/practice')).body.awarded).toBe(2);
    const last = (await s.call('post', '/practice')).body;
    expect(last.awarded).toBe(0);
    expect(last.snapshot).toMatchObject({ tokens: 6, practiceLeft: 0 });
  });
});
