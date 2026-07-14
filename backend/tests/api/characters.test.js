import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createStudent, createTeacher, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

async function validLayers() {
  const { body: catalog } = await request(app).get('/api/characters/catalog');
  return {
    skinTone: catalog.skinTones[0].id,
    hairStyle: catalog.hairStyles[0].id,
    hairColor: catalog.hairColors[0].id,
    face: catalog.faces[0].id,
    outfit: catalog.outfits[0].id,
    outfitColor: catalog.outfitColors[0].id,
    accessory: catalog.accessories[0].id,
  };
}

describe('GET /api/characters/catalog', () => {
  it('devuelve el catálogo de partes sin autenticación', async () => {
    const res = await request(app).get('/api/characters/catalog');
    expect(res.status).toBe(200);
    expect(res.body.skinTones.length).toBeGreaterThan(0);
    expect(res.body.accessories.some(a => a.id === 'none')).toBe(true);
  });
});

describe('GET /api/characters/me', () => {
  it('devuelve 404 si el alumno aún no tiene personaje', async () => {
    const student = await createStudent(pool, { courseName: '4to Básico B' });
    const token = signToken(studentPayload(student));

    const res = await request(app).get('/api/characters/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/characters/me', () => {
  it('crea el personaje la primera vez y lo actualiza después (upsert)', async () => {
    const student = await createStudent(pool, { courseName: '4to Básico B' });
    const token = signToken(studentPayload(student));
    const layers = await validLayers();

    const createRes = await request(app)
      .put('/api/characters/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ layers });

    expect(createRes.status).toBe(200);
    expect(createRes.body.character.layers).toMatchObject(layers);

    const getRes = await request(app).get('/api/characters/me').set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.character.layers).toMatchObject(layers);

    const { body: catalog } = await request(app).get('/api/characters/catalog');
    const updatedLayers = { ...layers, hairStyle: catalog.hairStyles[1].id };

    const updateRes = await request(app)
      .put('/api/characters/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ layers: updatedLayers });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.character.layers.hairStyle).toBe(catalog.hairStyles[1].id);

    const { rows } = await pool.query('SELECT * FROM characters WHERE student_id = $1', [student.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].layers.hairStyle).toBe(catalog.hairStyles[1].id);
  });

  it('devuelve 400 con detalle si una capa no existe en el catálogo', async () => {
    const student = await createStudent(pool, { courseName: '4to Básico B' });
    const token = signToken(studentPayload(student));
    const layers = await validLayers();
    layers.skinTone = 'skin_no_existe';

    const res = await request(app)
      .put('/api/characters/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ layers });

    expect(res.status).toBe(400);
    expect(res.body.details.some(d => d.includes('skinTone'))).toBe(true);
  });
});

describe('guards de rol en /api/characters', () => {
  it('GET /api/characters/me sin token devuelve 401', async () => {
    const res = await request(app).get('/api/characters/me');
    expect(res.status).toBe(401);
  });

  it('PUT /api/characters/me con token de docente devuelve 403', async () => {
    const teacher = await createTeacher(pool);
    const token = signToken(teacherPayload(teacher));
    const layers = await validLayers();

    const res = await request(app)
      .put('/api/characters/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ layers });

    expect(res.status).toBe(403);
  });
});
