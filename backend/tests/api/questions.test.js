import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTeacher, signToken, teacherPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

async function authedTeacher() {
  const teacher = await createTeacher(pool);
  return signToken(teacherPayload(teacher));
}

const basePayload = {
  subject: 'matematica',
  grade_level: '5b',
  difficulty: 'easy',
  text: '¿Cuánto es 2 + 2?',
  options: ['3', '4', '5', '6'],
  correct: '4',
  hint: 'Suma simple',
};

describe('CRUD /api/questions', () => {
  it('crea, lista, obtiene, actualiza, alterna y elimina una pregunta', async () => {
    const token = await authedTeacher();
    const auth = (req) => req.set('Authorization', `Bearer ${token}`);

    const created = await auth(request(app).post('/api/questions')).send(basePayload);
    expect(created.status).toBe(201);
    expect(created.body.text).toBe(basePayload.text);
    const id = created.body.id;

    const list = await auth(request(app).get('/api/questions').query({ subject: 'matematica' }));
    expect(list.status).toBe(200);
    expect(list.body.some(q => q.id === id)).toBe(true);

    const detail = await auth(request(app).get(`/api/questions/${id}`));
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(id);

    const updated = await auth(request(app).put(`/api/questions/${id}`)).send({ ...basePayload, text: '¿Cuánto es 3 + 3?', correct: '6', options: ['5', '6', '7', '8'] });
    expect(updated.status).toBe(200);
    expect(updated.body.text).toBe('¿Cuánto es 3 + 3?');

    const toggled = await auth(request(app).patch(`/api/questions/${id}/toggle`));
    expect(toggled.status).toBe(200);
    expect(toggled.body.active).toBe(false);

    const deleted = await auth(request(app).delete(`/api/questions/${id}`));
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(id);

    const afterDelete = await auth(request(app).get(`/api/questions/${id}`));
    expect(afterDelete.status).toBe(404);
  });

  it('rechaza un payload inválido con 400', async () => {
    const token = await authedTeacher();
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, options: ['solo una opción'] });

    expect(res.status).toBe(400);
  });
});
