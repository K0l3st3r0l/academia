import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, createQuestion, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { nameProblem } = await import('../../src/services/characterName.js');
const { rateUnratedAnswers } = await import('../../src/services/skillRatings.js');
const { syncCurriculum } = await import('../../src/services/curriculum.js');

const FIELDS = {
  skinTone: 'skinTones', hairStyle: 'hairStyles', hairColor: 'hairColors', eyes: 'eyes', eyeColor: 'eyeColors',
  brows: 'brows', nose: 'noses', mouth: 'mouths', top: 'tops', topColor: 'topColors', bottom: 'bottoms',
  bottomColor: 'bottomColors', shoes: 'shoes', shoeColor: 'shoeColors',
};
const { body: CATALOG } = await request(app).get('/api/characters/catalog');
const LAYERS = Object.fromEntries(Object.entries(FIELDS).map(([field, list]) => [field, CATALOG[list][0].id]));

async function studentWithCharacter({ tokens = 0, name = 'Cóndor Sabio' } = {}) {
  const student = await createStudent(pool, { courseName: '5° Básico A', tokensBalance: tokens });
  const token = signToken(studentPayload(student));
  const res = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: LAYERS, name });
  expect(res.status).toBe(200);
  return { student, token };
}

const balance = async id => (await pool.query('SELECT tokens_balance FROM local_students WHERE id = $1', [id])).rows[0].tokens_balance;

describe('cuenta de prueba', () => {
  it('antes de crear el personaje ya trae todos los artículos (el editor los necesita para crearlo)', async () => {
    const tester = await createStudent(pool, { courseName: '5° Básico A', isTest: true });
    const res = await request(app).get('/api/characters/me').set('Authorization', `Bearer ${signToken(studentPayload(tester))}`);
    expect(res.status).toBe(404);
    const priced = Object.values(CATALOG).filter(Array.isArray).flat().filter(e => e.price > 0).map(e => e.id);
    expect(res.body.ownedItems.sort()).toEqual(priced.sort());
  });

  it('tiene todos los artículos sin comprarlos', async () => {
    const tester = await createStudent(pool, { courseName: '5° Básico A', isTest: true });
    const token = signToken(studentPayload(tester));
    const priced = Object.values(CATALOG).filter(Array.isArray).flat().filter(e => e.price > 0).map(e => e.id);
    const layers = { ...LAYERS, top: CATALOG.tops.find(t => t.price > 0).id };

    const res = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers, name: 'Probador' });
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/characters/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.ownedItems.sort()).toEqual(priced.sort());
  });
});

describe('nombre del personaje', () => {
  it('deja pasar nombres normales y frena contacto, largos y groserías evidentes', () => {
    expect(nameProblem('Puma Veloz')).toBeNull();
    expect(nameProblem('Ñandú 2000')).toBeNull();
    expect(nameProblem('Computadora')).toBeNull();
    expect(nameProblem('ab')).toMatch(/entre 3 y 20/);
    expect(nameProblem('x'.repeat(21))).toMatch(/entre 3 y 20/);
    expect(nameProblem('Llámame 912345678')).toMatch(/4 números|entre 3 y 20/);
    expect(nameProblem('yo@correo.cl')).toMatch(/solo letras/);
    expect(nameProblem('el WE0000N')).toMatch(/no está permitido/);
    expect(nameProblem('Puta Madre')).toMatch(/no está permitido/);
  });

  it('exige nombre al crear y cambiarlo después cuesta tokens', async () => {
    const student = await createStudent(pool, { courseName: '5° Básico A' });
    const token = signToken(studentPayload(student));
    const noName = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: LAYERS });
    expect(noName.status).toBe(400);
    expect(noName.body.code).toBe('invalid_name');

    const { student: rich, token: richToken } = await studentWithCharacter({ tokens: 150 });
    // Editing looks doesn't touch the name.
    const edit = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${richToken}`).send({ layers: LAYERS, name: 'Otro Nombre' });
    expect(edit.body.character.name).toBe('Cóndor Sabio');

    const rename = await request(app).put('/api/characters/me/name').set('Authorization', `Bearer ${richToken}`).send({ name: 'Zorro Azul' });
    expect(rename.status).toBe(200);
    expect(rename.body).toMatchObject({ cost: 100, tokens: 50, character: { name: 'Zorro Azul', name_status: 'pending' } });
    expect(await balance(rich.id)).toBe(50);
    const { rows: ledger } = await pool.query('SELECT amount, reason FROM token_ledger WHERE student_id = $1', [rich.id]);
    expect(ledger).toEqual([{ amount: -100, reason: 'character_rename' }]);

    const broke = await request(app).put('/api/characters/me/name').set('Authorization', `Bearer ${richToken}`).send({ name: 'Lobo Rojo' });
    expect(broke.status).toBe(400);
    expect(broke.body.code).toBe('insufficient_tokens');
    expect(await balance(rich.id)).toBe(50);
  });

  it('el admin revisa los nombres; uno rechazado se cambia gratis', async () => {
    const { student, token } = await studentWithCharacter({ tokens: 0 });
    const admin = signToken(teacherPayload(await createTeacher(pool, { roles: ['admin'] })));
    const teacher = signToken(teacherPayload(await createTeacher(pool)));

    expect((await request(app).get('/api/characters/names').set('Authorization', `Bearer ${teacher}`)).status).toBe(403);
    const pending = await request(app).get('/api/characters/names').set('Authorization', `Bearer ${admin}`);
    expect(pending.body.names).toEqual([expect.objectContaining({ student_id: student.id, name: 'Cóndor Sabio', name_status: 'pending', course_name: '5° Básico A' })]);

    const reject = await request(app).patch(`/api/characters/names/${student.id}`).set('Authorization', `Bearer ${admin}`).send({ status: 'rejected' });
    expect(reject.body.character.name_status).toBe('rejected');

    const fix = await request(app).put('/api/characters/me/name').set('Authorization', `Bearer ${token}`).send({ name: 'Huemul Feliz' });
    expect(fix.status).toBe(200);
    expect(fix.body).toMatchObject({ cost: 0, character: { name: 'Huemul Feliz', name_status: 'pending' } });
  });
});

describe('artículos con precio', () => {
  it('no deja usar un color sin comprarlo; comprarlo descuenta tokens una sola vez', async () => {
    const { student, token } = await studentWithCharacter({ tokens: 70 });
    const purple = CATALOG.hairColors.find(c => c.name === 'Morado');
    const withPurple = { ...LAYERS, hairColor: purple.id };
    expect(purple.price).toBe(40);

    const blocked = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: withPurple });
    expect(blocked.status).toBe(400);
    expect(blocked.body).toMatchObject({ code: 'not_owned', details: [purple.id] });

    const buy = await request(app).post(`/api/characters/me/items/${purple.id}`).set('Authorization', `Bearer ${token}`);
    expect(buy.body).toMatchObject({ itemId: purple.id, price: 40, tokens: 30 });
    const again = await request(app).post(`/api/characters/me/items/${purple.id}`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(400);
    expect(await balance(student.id)).toBe(30);

    const wear = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: withPurple });
    expect(wear.status).toBe(200);
    const me = await request(app).get('/api/characters/me').set('Authorization', `Bearer ${token}`);
    expect(me.body).toMatchObject({ ownedItems: [purple.id], tokens: 30 });

    const blue = CATALOG.hairColors.find(c => c.name === 'Azul');
    const poor = await request(app).post(`/api/characters/me/items/${blue.id}`).set('Authorization', `Bearer ${token}`);
    expect(poor.body.code).toBe('insufficient_tokens');
    const free = await request(app).post(`/api/characters/me/items/${CATALOG.skinTones[0].id}`).set('Authorization', `Bearer ${token}`);
    expect(free.status).toBe(400);
  });
});

describe('accesorios', () => {
  it('son opcionales, «ninguno» es gratis y uno con precio se compra antes de usarlo', async () => {
    const { token } = await studentWithCharacter({ tokens: 100 });
    const crown = CATALOG.headwear.find(a => a.id === 'cabeza-corona');
    const glasses = CATALOG.eyewear.find(a => a.id === 'cara-lentes-redondos');
    expect(crown.price).toBe(80);
    expect(glasses.price).toBeUndefined();

    const withGlasses = { ...LAYERS, eyewear: glasses.id, headwear: 'ninguno' };
    expect((await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: withGlasses })).status).toBe(200);

    const withCrown = { ...withGlasses, headwear: crown.id };
    const blocked = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: withCrown });
    expect(blocked.body).toMatchObject({ code: 'not_owned', details: [crown.id] });
    await request(app).post(`/api/characters/me/items/${crown.id}`).set('Authorization', `Bearer ${token}`);
    const worn = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: withCrown });
    expect(worn.body.character.layers.headwear).toBe(crown.id);

    const bogus = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: { ...LAYERS, headwear: 'cabeza-no-existe' } });
    expect(bogus.status).toBe(400);
  });

  it('el vestido está marcado como que cubre la parte de abajo', () => {
    expect(CATALOG.tops.find(t => t.id === 'top-vestido').coversBottom).toBe(true);
  });
});

describe('atributos del personaje', () => {
  it('quedan por descubrir con pocas respuestas y se calculan con las suficientes', async () => {
    await syncCurriculum();
    const { student, token } = await studentWithCharacter();
    const empty = await request(app).get('/api/characters/me/stats').set('Authorization', `Bearer ${token}`);
    expect(empty.body.attributes.map(a => a.label)).toEqual(['Fuerza', 'Energía', 'Percepción', 'Resistencia', 'Agilidad']);
    expect(empty.body.attributes.every(a => a.value === null)).toBe(true);

    const question = await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', options: ['1', '2', '3', '4'], correct: '1', oaCode: 'OA20' });
    const teacher = await createTeacher(pool);
    const { rows: [room] } = await pool.query("INSERT INTO rooms (code, teacher_id, course_name, subject) VALUES ('STAT01', $1, '5° Básico A', 'matematica') RETURNING id", [teacher.id]);
    const { rows: [session] } = await pool.query("INSERT INTO game_sessions (room_id, subject) VALUES ($1, 'matematica') RETURNING id", [room.id]);
    for (let i = 0; i < 6; i++) {
      await pool.query(
        `INSERT INTO student_answers (session_id, student_id, question_index, question_id, answer, is_correct, time_taken_ms)
         VALUES ($1, $2, $3, $4, '1', true, 1000)`,
        [session.id, student.id, i, question.id]
      );
    }
    await rateUnratedAnswers();

    const stats = await request(app).get('/api/characters/me/stats').set('Authorization', `Bearer ${token}`);
    const fuerza = stats.body.attributes.find(a => a.key === 'fuerza');
    expect(fuerza.value).toBeGreaterThan(50);
    expect(fuerza.ejes).toEqual([expect.objectContaining({ eje: 'Medición', answers: 6 })]);
    expect(stats.body.attributes.find(a => a.key === 'energia').value).toBeNull();
  });
});
