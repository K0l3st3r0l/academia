import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, createQuestion, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { syncCurriculum } = await import('../../src/services/curriculum.js');
const { scheduleRating } = await import('../../src/services/skillRatings.js');

const COURSE = '5° Básico A';

async function student() {
  const row = await createStudent(pool, { courseName: COURSE });
  return { row, auth: `Bearer ${signToken(studentPayload(row))}` };
}
async function teacher(roles = ['teacher']) {
  const row = await createTeacher(pool, { roles, firstName: 'Ana', lastName: 'Rojas' });
  return { row, auth: `Bearer ${signToken(teacherPayload(row))}` };
}
const copihues = async id => (await pool.query('SELECT copihues_balance FROM local_students WHERE id = $1', [id])).rows[0].copihues_balance;

async function play(auth, key, answer = '20') {
  const start = await request(app).post(`/api/world/matematica/levels/${key}/start`).set('Authorization', auth);
  expect(start.status).toBe(201);
  let last;
  for (let index = 0; index < start.body.questions.length; index += 1) {
    last = await request(app).post(`/api/world/attempts/${start.body.attemptId}/answer`).set('Authorization', auth)
      .send({ index, answer: typeof answer === 'function' ? answer(index) : answer });
  }
  return last.body;
}

afterEach(async () => {
  await scheduleRating();
});

describe('copihues que entrega el profesor', () => {
  it('reconoce a varios alumnos con un motivo; el alumno lo ve una vez', async () => {
    const t = await teacher();
    const a = await student();
    const b = await student();
    const res = await request(app).post('/api/copihues/awards').set('Authorization', t.auth)
      .send({ studentIds: [a.row.id, b.row.id], amount: 2, reason: '  Ayudó a un compañero  ' });
    expect(res.status).toBe(201);
    expect(res.body.awards).toHaveLength(2);
    expect(await copihues(a.row.id)).toBe(2);

    const me = await request(app).get('/api/copihues/me').set('Authorization', a.auth);
    expect(me.body.balance).toBe(2);
    expect(me.body.unseen).toHaveLength(1);
    expect(me.body.unseen[0]).toMatchObject({ amount: 2, reason: 'teacher', detail: 'Ayudó a un compañero', giver_first_name: 'Ana', giver_last_name: 'Rojas' });

    await request(app).post('/api/copihues/me/seen').set('Authorization', a.auth);
    expect((await request(app).get('/api/copihues/me').set('Authorization', a.auth)).body.unseen).toHaveLength(0);
  });

  it('pide motivo, de 1 a 3 copihues, y solo el personal puede entregarlos', async () => {
    const t = await teacher();
    const a = await student();
    const send = (auth, body) => request(app).post('/api/copihues/awards').set('Authorization', auth).send(body);
    expect((await send(t.auth, { studentIds: [a.row.id], reason: ' ' })).status).toBe(400);
    expect((await send(t.auth, { studentIds: [a.row.id], amount: 4, reason: 'Bien' })).status).toBe(400);
    expect((await send(t.auth, { studentIds: [], reason: 'Bien' })).status).toBe(400);
    expect((await send(a.auth, { studentIds: [a.row.id], reason: 'Bien' })).status).toBe(403);
    expect(await copihues(a.row.id)).toBe(0);
  });

  it('el curso muestra los reconocimientos del mes y cuántos recibió cada alumno', async () => {
    const t = await teacher();
    const a = await student();
    const other = await createStudent(pool, { courseName: '6° Básico A' });
    await request(app).post('/api/copihues/awards').set('Authorization', t.auth).send({ studentIds: [a.row.id], reason: 'Participó' });
    await request(app).post('/api/copihues/awards').set('Authorization', t.auth).send({ studentIds: [a.row.id, other.id], amount: 2, reason: 'Trabajo en equipo' });

    const res = await request(app).get('/api/copihues/awards').query({ course_name: COURSE }).set('Authorization', t.auth);
    expect(res.status).toBe(200);
    expect(res.body.awards.map(r => r.detail)).toEqual(['Trabajo en equipo', 'Participó']);
    expect(res.body.awards.every(r => r.canUndo)).toBe(true);
    expect(res.body.perStudent).toEqual({ [a.row.id]: 3 });
  });

  it('deshacer: solo quien lo entregó o un admin, y devuelve el saldo', async () => {
    const t = await teacher();
    const otherTeacher = await teacher();
    const admin = await teacher(['admin']);
    const a = await student();
    const { body } = await request(app).post('/api/copihues/awards').set('Authorization', t.auth).send({ studentIds: [a.row.id], amount: 3, reason: 'Se esforzó' });
    const id = (await pool.query('SELECT id FROM copihue_ledger WHERE student_id = $1', [a.row.id])).rows[0].id;
    expect(body.awards[0].id).toBe(id);

    expect((await request(app).delete(`/api/copihues/awards/${id}`).set('Authorization', otherTeacher.auth)).status).toBe(403);
    expect((await request(app).delete(`/api/copihues/awards/${id}`).set('Authorization', admin.auth)).status).toBe(200);
    expect(await copihues(a.row.id)).toBe(0);

    await request(app).post('/api/copihues/awards').set('Authorization', t.auth).send({ studentIds: [a.row.id], reason: 'Se esforzó' });
    const old = (await pool.query("UPDATE copihue_ledger SET created_at = NOW() - interval '2 days' WHERE student_id = $1 RETURNING id", [a.row.id])).rows[0].id;
    expect((await request(app).delete(`/api/copihues/awards/${old}`).set('Authorization', t.auth)).status).toBe(409);
  });
});

describe('copihues por logros en el mundo', () => {
  beforeEach(async () => {
    await syncCurriculum();
    for (const oa of ['OA1', 'OA2', 'OA3']) {
      for (let i = 0; i < 3; i += 1) {
        await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', oaCode: oa, options: ['10', '20', '30', '40'], correct: '20', text: `${oa} ${i}` });
      }
    }
  });

  it('la primera vez con 3 estrellas da 1 copihue; repetirlo no', async () => {
    const { row, auth } = await student();
    const first = await play(auth, 'OA1');
    expect(first.finished.copihues).toEqual([{ amount: 1, reason: 'level_perfect', detail: 'Números hasta 1.000 millones' }]);
    expect(first.copihues).toBe(1);
    const again = await play(auth, 'OA1');
    expect(again.finished.copihues).toEqual([]);
    expect(await copihues(row.id)).toBe(1);
  });

  it('sin 3 estrellas no hay copihue', async () => {
    const { row, auth } = await student();
    const res = await play(auth, 'OA1', i => (i === 0 ? '10' : '20'));
    expect(res.finished.stars).toBe(2);
    expect(res.finished.copihues).toEqual([]);
    expect(await copihues(row.id)).toBe(0);
  });

  it('ganar el desafío por primera vez da 3 (más 1 si es perfecto)', async () => {
    const { auth } = await student();
    for (const oa of ['OA1', 'OA2', 'OA3']) await play(auth, oa);
    const res = await play(auth, 'desafio-1');
    expect(res.finished.copihues.map(c => [c.reason, c.amount])).toEqual([['challenge', 3], ['level_perfect', 1]]);
    expect(res.finished.copihues[0].detail).toBe('Desafío del Observatorio');
  });

  it('cada 3 días seguidos terminando niveles da 1', async () => {
    const { row, auth } = await student();
    for (const daysAgo of [1, 2]) {
      await pool.query(
        `INSERT INTO practice_attempts (student_id, subject, grade_level, level_key, questions, finished_at)
         VALUES ($1, 'matematica', '5b', 'OA1', '[]', NOW() - make_interval(days => $2))`,
        [row.id, daysAgo]
      );
    }
    const res = await play(auth, 'OA1', i => (i === 0 ? '10' : '20'));
    expect(res.finished.copihues).toEqual([{ amount: 1, reason: 'streak', detail: '3 días seguidos' }]);
    const sameDay = await play(auth, 'OA2', i => (i === 0 ? '10' : '20'));
    expect(sameDay.finished.copihues).toEqual([]);
  });
});
