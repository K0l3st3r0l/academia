import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, createQuestion, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { nameProblem } = await import('../../src/services/characterName.js');
const { rateUnratedAnswers } = await import('../../src/services/skillRatings.js');
const { syncCurriculum } = await import('../../src/services/curriculum.js');

const LAYERS = {
  skinTone: 'skin_1', hairStyle: 'hair_style_1', hairColor: 'hair_color_1', face: 'face_1',
  outfit: 'outfit_1', outfitColor: 'outfit_color_1', accessory: 'none',
};

async function studentWithCharacter({ tokens = 0, name = 'Cóndor Sabio' } = {}) {
  const student = await createStudent(pool, { courseName: '5° Básico A', tokensBalance: tokens });
  const token = signToken(studentPayload(student));
  const res = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: LAYERS, name });
  expect(res.status).toBe(200);
  return { student, token };
}

const balance = async id => (await pool.query('SELECT tokens_balance FROM local_students WHERE id = $1', [id])).rows[0].tokens_balance;

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
  it('no deja usar un artículo sin comprarlo; comprarlo descuenta tokens una sola vez', async () => {
    const { student, token } = await studentWithCharacter({ tokens: 70 });
    const withCap = { ...LAYERS, accessory: 'accessory_2' };
    const { body: catalog } = await request(app).get('/api/characters/catalog');
    const cap = catalog.accessories.find(a => a.name === 'Gorro');
    withCap.accessory = cap.id;

    const blocked = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: withCap });
    expect(blocked.status).toBe(400);
    expect(blocked.body).toMatchObject({ code: 'not_owned', details: [cap.id] });

    const buy = await request(app).post(`/api/characters/me/items/${cap.id}`).set('Authorization', `Bearer ${token}`);
    expect(buy.body).toMatchObject({ itemId: cap.id, price: 50, tokens: 20 });
    const again = await request(app).post(`/api/characters/me/items/${cap.id}`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(400);
    expect(await balance(student.id)).toBe(20);

    const wear = await request(app).put('/api/characters/me').set('Authorization', `Bearer ${token}`).send({ layers: withCap });
    expect(wear.status).toBe(200);
    const me = await request(app).get('/api/characters/me').set('Authorization', `Bearer ${token}`);
    expect(me.body).toMatchObject({ ownedItems: [cap.id], tokens: 20 });

    const backpack = catalog.accessories.find(a => a.name === 'Mochila');
    const poor = await request(app).post(`/api/characters/me/items/${backpack.id}`).set('Authorization', `Bearer ${token}`);
    expect(poor.body.code).toBe('insufficient_tokens');
    const free = await request(app).post('/api/characters/me/items/skin_1').set('Authorization', `Bearer ${token}`);
    expect(free.status).toBe(400);
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
