import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, createQuestion, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { syncCurriculum } = await import('../../src/services/curriculum.js');
const { starsFor, payFor } = await import('../../src/services/world.js');
const { scheduleRating } = await import('../../src/services/skillRatings.js');

const COURSE = '5° Básico A';
const OPTIONS = ['10', '20', '30', '40'];

async function student() {
  const row = await createStudent(pool, { courseName: COURSE });
  return { row, auth: `Bearer ${signToken(studentPayload(row))}` };
}

async function questions(oaCode, n, extra = {}) {
  const made = [];
  for (let i = 0; i < n; i += 1) {
    made.push(await createQuestion(pool, {
      subject: 'matematica', gradeLevel: '5b', oaCode, options: OPTIONS, correct: '20', text: `${oaCode} pregunta ${i}`, ...extra,
    }));
  }
  return made;
}

const balance = async id => (await pool.query('SELECT tokens_balance FROM local_students WHERE id = $1', [id])).rows[0].tokens_balance;
const levelOf = (map, key) => map.islands.flatMap(i => [...i.levels, i.challenge]).find(l => l.key === key);

async function play(auth, key, answerFor = () => '20') {
  const start = await request(app).post(`/api/world/matematica/levels/${key}/start`).set('Authorization', auth);
  expect(start.status).toBe(201);
  let last;
  for (let index = 0; index < start.body.questions.length; index += 1) {
    last = await request(app).post(`/api/world/attempts/${start.body.attemptId}/answer`).set('Authorization', auth)
      .send({ index, answer: answerFor(index), timeMs: 3000 });
    expect(last.status).toBe(200);
  }
  return { start, last };
}

beforeEach(async () => {
  await syncCurriculum();
});

// Each answer queues a rating pass in the background; the next test's TRUNCATE must not race it.
afterEach(async () => {
  await scheduleRating();
});

describe('reglas del mundo', () => {
  it('estrellas: sin errores 3, un error 2, al menos la mitad 1, menos no pasa', () => {
    expect([starsFor(6, 6), starsFor(5, 6), starsFor(3, 6), starsFor(2, 6)]).toEqual([3, 2, 1, 0]);
  });

  it('un acierto paga más donde el alumno está débil y casi nada donde domina', () => {
    expect(payFor(0)).toBe(5);
    expect(payFor(-3)).toBeGreaterThanOrEqual(9);
    expect(payFor(3)).toBe(1);
  });
});

describe('mapa del mundo', () => {
  it('abre el primer nivel jugable; los que no tienen preguntas aprobadas no bloquean', async () => {
    await questions('OA1', 4);
    await questions('OA3', 3);
    await questions('OA2', 5, { status: 'draft' });
    const { auth } = await student();

    const res = await request(app).get('/api/world/matematica').set('Authorization', auth);
    expect(res.status).toBe(200);
    const [island] = res.body.islands;
    expect(island.levels.map(l => [l.key, l.state])).toEqual([
      ['OA1', 'open'], ['OA2', 'preparing'], ['OA3', 'locked'], ['OA4', 'preparing'], ['OA5', 'preparing'],
      ['OA6', 'preparing'], ['OA14', 'preparing'], ['OA15', 'preparing'],
    ]);
    expect(island.levels[0]).toMatchObject({ label: 'Números hasta 1.000 millones', at: [603, 1105] });
    expect(island.challenge).toMatchObject({ key: 'desafio-1', state: 'preparing' });
    expect(res.body.current).toBe('OA1');
    expect(res.body.comingUnits.map(u => u.unit)).toEqual([2, 3, 4]);
    expect(res.body.stars).toEqual({ earned: 0, max: 6 });
  });

  it('solo para alumnos de un curso con mapa', async () => {
    const teacher = await createTeacher(pool);
    const asTeacher = await request(app).get('/api/world/matematica').set('Authorization', `Bearer ${signToken(teacherPayload(teacher))}`);
    expect(asTeacher.status).toBe(403);
    const { auth } = await student();
    expect((await request(app).get('/api/world/historia').set('Authorization', auth)).status).toBe(404);
  });

  it('un nivel cerrado o sin preguntas no se puede empezar', async () => {
    await questions('OA1', 3);
    await questions('OA3', 3);
    const { auth } = await student();
    const locked = await request(app).post('/api/world/matematica/levels/OA3/start').set('Authorization', auth);
    expect(locked.body.code).toBe('locked');
    const empty = await request(app).post('/api/world/matematica/levels/OA2/start').set('Authorization', auth);
    expect(empty.body.code).toBe('preparing');
  });
});

describe('jugar un nivel', () => {
  it('sin errores: 3 estrellas, tokens por acierto y bono por estrella; se abre el siguiente', async () => {
    await questions('OA1', 8);
    await questions('OA2', 3);
    const { row, auth } = await student();

    const { start, last } = await play(auth, 'OA1');
    expect(start.body.questions).toHaveLength(6);
    expect(start.body.questions[0]).not.toHaveProperty('correct');
    expect(last.body.finished).toEqual({ stars: 3, previousStars: 0, correct: 6, total: 6, bonus: 15, tokens: 45 });
    expect(await balance(row.id)).toBe(45);

    const { rows: answers } = await pool.query('SELECT attempt_id FROM student_answers WHERE student_id = $1', [row.id]);
    expect(answers).toHaveLength(6);
    expect(answers.every(a => a.attempt_id === start.body.attemptId)).toBe(true);

    const map = (await request(app).get('/api/world/matematica').set('Authorization', auth)).body;
    expect(levelOf(map, 'OA1')).toMatchObject({ state: 'done', stars: 3 });
    expect(levelOf(map, 'OA2').state).toBe('open');
    expect(map.current).toBe('OA2');
  });

  it('repetir: lo ya acertado no vuelve a pagar y el bono solo paga estrellas nuevas', async () => {
    await questions('OA1', 6);
    const { row, auth } = await student();
    await play(auth, 'OA1', i => (i < 2 ? '10' : '20'));
    const first = await balance(row.id);

    const { last } = await play(auth, 'OA1');
    expect(last.body.finished.stars).toBe(3);
    expect(last.body.finished.bonus).toBe(10);
    const { rows: [progress] } = await pool.query('SELECT stars, plays FROM student_level_progress WHERE student_id = $1', [row.id]);
    expect(progress).toEqual({ stars: 3, plays: 2 });
    // Only the two questions missed the first time pay now.
    expect(await balance(row.id) - first).toBe(last.body.finished.tokens);
    expect(last.body.finished.tokens).toBeLessThan(6 * 5 + 10);
  });

  it('con menos de la mitad no gana estrellas y el siguiente sigue cerrado', async () => {
    await questions('OA1', 6);
    await questions('OA2', 3);
    const { auth } = await student();
    const { last } = await play(auth, 'OA1', i => (i < 4 ? '10' : '20'));
    expect(last.body.finished.stars).toBe(0);
    const map = (await request(app).get('/api/world/matematica').set('Authorization', auth)).body;
    expect(levelOf(map, 'OA2').state).toBe('locked');
  });

  it('respuesta incorrecta: muestra la correcta, la explicación y el error de esa alternativa', async () => {
    const [q] = await questions('OA1', 3, { hint: 'Porque sí' });
    await pool.query('UPDATE questions SET option_notes = $1', [JSON.stringify({ 10: 'Sumaste en vez de multiplicar' })]);
    const { auth } = await student();
    const start = await request(app).post('/api/world/matematica/levels/OA1/start').set('Authorization', auth);
    const res = await request(app).post(`/api/world/attempts/${start.body.attemptId}/answer`).set('Authorization', auth).send({ index: 0, answer: '10' });
    expect(res.body).toMatchObject({ correct: false, correctAnswer: '20', explanation: 'Porque sí', note: 'Sumaste en vez de multiplicar', tokens: 0 });
    expect(q.id).toBeTruthy();
  });

  it('protege el orden, la alternativa y el dueño del intento', async () => {
    await questions('OA1', 3);
    const { auth } = await student();
    const other = await student();
    const start = await request(app).post('/api/world/matematica/levels/OA1/start').set('Authorization', auth);
    const url = `/api/world/attempts/${start.body.attemptId}/answer`;

    expect((await request(app).post(url).set('Authorization', auth).send({ index: 1, answer: '20' })).status).toBe(409);
    expect((await request(app).post(url).set('Authorization', auth).send({ index: 0, answer: '99' })).status).toBe(400);
    expect((await request(app).post(url).set('Authorization', other.auth).send({ index: 0, answer: '20' })).status).toBe(404);
    expect((await request(app).post(url).set('Authorization', auth).send({ index: 0, answer: '20' })).status).toBe(200);
    expect((await request(app).post(url).set('Authorization', auth).send({ index: 0, answer: '20' })).status).toBe(409);
  });

  it('la ayuda del compañero: la pista de la pregunta, o descarta una incorrecta; una por nivel', async () => {
    await questions('OA1', 3);
    const { auth } = await student();
    const start = await request(app).post('/api/world/matematica/levels/OA1/start').set('Authorization', auth);
    const url = `/api/world/attempts/${start.body.attemptId}/clue`;
    const help = await request(app).post(url).set('Authorization', auth).send({ index: 0 });
    expect(help.status).toBe(200);
    expect(['10', '30', '40']).toContain(help.body.discard);
    expect((await request(app).post(url).set('Authorization', auth).send({ index: 0 })).body.code).toBe('clue_used');

    await pool.query("UPDATE questions SET clue = 'Piensa en decenas'");
    const again = await request(app).post('/api/world/matematica/levels/OA1/start').set('Authorization', auth);
    const clue = await request(app).post(`/api/world/attempts/${again.body.attemptId}/clue`).set('Authorization', auth).send({ index: 0 });
    expect(clue.body).toEqual({ clue: 'Piensa en decenas' });
  });

  it('el desafío toma una pregunta por OA y se abre al tener estrellas en todos los niveles', async () => {
    for (const oa of ['OA1', 'OA2', 'OA3']) await questions(oa, 3);
    const { auth } = await student();
    for (const oa of ['OA1', 'OA2', 'OA3']) await play(auth, oa);

    const map = (await request(app).get('/api/world/matematica').set('Authorization', auth)).body;
    expect(levelOf(map, 'desafio-1')).toMatchObject({ state: 'open', oaCodes: ['OA1', 'OA2', 'OA3'] });
    const { start, last } = await play(auth, 'desafio-1');
    expect(start.body.level.isChallenge).toBe(true);
    expect(start.body.questions.map(q => q.text.split(' ')[0]).sort()).toEqual(['OA1', 'OA2', 'OA3']);
    expect(last.body.finished).toMatchObject({ stars: 3, bonus: 30 });
  });
});
