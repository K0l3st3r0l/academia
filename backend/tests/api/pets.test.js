import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

const COURSE = '5° Básico A';

async function student({ tokens = 0 } = {}) {
  const row = await createStudent(pool, { courseName: COURSE, tokensBalance: tokens });
  return { row, auth: `Bearer ${signToken(studentPayload(row))}` };
}

// One answer at noon Chile time on each of `days` consecutive days, plus a second one on the
// first day: two answers the same day count once.
async function playOnDays(studentId, days) {
  for (let i = 0; i < days; i += 1) {
    const at = `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00-03:00`;
    const times = i === 0 ? 2 : 1;
    for (let j = 0; j < times; j += 1) {
      await pool.query(
        'INSERT INTO student_answers (student_id, question_index, answer, is_correct, answered_at) VALUES ($1, $2, $3, true, $4)',
        [studentId, j, 'x', at]
      );
    }
  }
}

const balance = async id => (await pool.query('SELECT tokens_balance FROM local_students WHERE id = $1', [id])).rows[0].tokens_balance;

describe('mascota compañera', () => {
  it('el catálogo trae las 6 especies y las 3 etapas', async () => {
    const res = await request(app).get('/api/pets/catalog');
    expect(res.status).toBe(200);
    expect(res.body.species.map(s => s.id)).toEqual(['pudu', 'chungungo', 'pinguino', 'monito', 'puma', 'zorro']);
    expect(res.body.stages.map(s => s.fromDays)).toEqual([0, 10, 30]);
  });

  it('se adopta gratis una sola vez, con especie del catálogo y nombre válido', async () => {
    const { auth } = await student();
    const none = await request(app).get('/api/pets/me').set('Authorization', auth);
    expect(none.body).toMatchObject({ pet: null, growth: { days: 0, stage: 1, nextStageAt: 10 } });

    const badSpecies = await request(app).post('/api/pets/me').set('Authorization', auth).send({ species: 'condor', name: 'Plumas' });
    expect(badSpecies.body.code).toBe('invalid_species');
    const badName = await request(app).post('/api/pets/me').set('Authorization', auth).send({ species: 'pudu', name: 'ab' });
    expect(badName.body.code).toBe('invalid_name');

    const adopt = await request(app).post('/api/pets/me').set('Authorization', auth).send({ species: 'pudu', name: ' Bosquecito ' });
    expect(adopt.status).toBe(201);
    expect(adopt.body.pet).toMatchObject({ species: 'pudu', name: 'Bosquecito', name_status: 'pending', stage_seen: 1 });

    const again = await request(app).post('/api/pets/me').set('Authorization', auth).send({ species: 'puma', name: 'Otro' });
    expect(again.status).toBe(409);
  });

  it('crece con los días distintos en que el alumno juega, no con las respuestas', async () => {
    const { row, auth } = await student();
    await playOnDays(row.id, 9);
    let me = await request(app).get('/api/pets/me').set('Authorization', auth);
    expect(me.body.growth).toMatchObject({ days: 9, stage: 1, daysToNext: 1 });

    await pool.query('DELETE FROM student_answers WHERE student_id = $1', [row.id]);
    await playOnDays(row.id, 10);
    me = await request(app).get('/api/pets/me').set('Authorization', auth);
    expect(me.body.growth).toMatchObject({ days: 10, stage: 2, nextStageAt: 30, daysToNext: 20 });
  });

  it('celebra cada etapa una vez: stage_seen sube al verla', async () => {
    const { row, auth } = await student();
    await request(app).post('/api/pets/me').set('Authorization', auth).send({ species: 'chungungo', name: 'Olita' });
    await playOnDays(row.id, 10);

    let me = await request(app).get('/api/pets/me').set('Authorization', auth);
    expect(me.body.pet.stage_seen).toBe(1);
    expect(me.body.growth.stage).toBe(2);

    const seen = await request(app).post('/api/pets/me/seen').set('Authorization', auth);
    expect(seen.body.pet.stage_seen).toBe(2);
  });

  it('cambiar de especie cuesta tokens y conserva el crecimiento', async () => {
    const { row, auth } = await student({ tokens: 200 });
    await request(app).post('/api/pets/me').set('Authorization', auth).send({ species: 'puma', name: 'Garra' });
    await playOnDays(row.id, 10);

    const same = await request(app).put('/api/pets/me/species').set('Authorization', auth).send({ species: 'puma' });
    expect(same.status).toBe(400);

    const change = await request(app).put('/api/pets/me/species').set('Authorization', auth).send({ species: 'zorro' });
    expect(change.status).toBe(200);
    expect(change.body).toMatchObject({ cost: 150, tokens: 50, pet: { species: 'zorro', name: 'Garra' } });
    expect(await balance(row.id)).toBe(50);

    const me = await request(app).get('/api/pets/me').set('Authorization', auth);
    expect(me.body.growth.stage).toBe(2);

    const broke = await request(app).put('/api/pets/me/species').set('Authorization', auth).send({ species: 'pudu' });
    expect(broke.body.code).toBe('insufficient_tokens');
  });

  it('el admin revisa los nombres; uno rechazado se cambia gratis y si no cuesta tokens', async () => {
    const { row, auth } = await student({ tokens: 100 });
    await request(app).post('/api/pets/me').set('Authorization', auth).send({ species: 'monito', name: 'Lunita' });
    const admin = `Bearer ${signToken(teacherPayload(await createTeacher(pool, { roles: ['admin'] })))}`;
    const teacher = `Bearer ${signToken(teacherPayload(await createTeacher(pool)))}`;

    expect((await request(app).get('/api/pets/names').set('Authorization', teacher)).status).toBe(403);
    const pending = await request(app).get('/api/pets/names').set('Authorization', admin);
    expect(pending.body.names.map(n => n.student_id)).toContain(row.id);

    await request(app).patch(`/api/pets/names/${row.id}`).set('Authorization', admin).send({ status: 'rejected' });
    const free = await request(app).put('/api/pets/me/name').set('Authorization', auth).send({ name: 'Estrellita' });
    expect(free.body).toMatchObject({ cost: 0, pet: { name: 'Estrellita', name_status: 'pending' } });

    const paid = await request(app).put('/api/pets/me/name').set('Authorization', auth).send({ name: 'Lucero' });
    expect(paid.body).toMatchObject({ cost: 100, tokens: 0 });
  });
});
