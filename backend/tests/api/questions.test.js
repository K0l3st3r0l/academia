import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTeacher, createStudent, createQuestion, signToken, teacherPayload, studentPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { pickQuestions } = await import('../../src/services/questionPicker.js');

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

describe('Revisión de borradores', () => {
  const draftOf = (text) => createQuestion(pool, {
    subject: 'ciencias', gradeLevel: '5b', oaCode: 'OA4', status: 'draft',
    text, options: ['Corazón', 'Pulmón', 'Riñón', 'Hígado'], correct: 'Corazón',
  });
  const picked = async (id) => (await pickQuestions({ subject: 'ciencias', gradeLevel: '5b', oaCodes: ['OA4'], count: 50, usedIds: new Set() }))
    .some(q => q.id === id);

  it('un borrador entra al juego solo después de aprobarlo', async () => {
    const token = await authedTeacher();
    const draft = await draftOf(`¿Qué órgano bombea la sangre? ${Date.now()}`);
    expect(await picked(draft.id)).toBe(false);

    const drafts = await request(app).get('/api/questions').set('Authorization', `Bearer ${token}`)
      .query({ status: 'draft', subject: 'ciencias', grade_level: '5b' });
    expect(drafts.body.some(q => q.id === draft.id)).toBe(true);

    const approved = await request(app).patch(`/api/questions/${draft.id}/review`)
      .set('Authorization', `Bearer ${token}`).send({ decision: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.reviewed_by).toBeTruthy();
    expect(await picked(draft.id)).toBe(true);
  });

  it('descartar exige un motivo y saca la pregunta del juego', async () => {
    const token = await authedTeacher();
    const draft = await draftOf(`¿Cuál órgano bombea sangre al cuerpo? ${Date.now()}`);
    const auth = (req) => req.set('Authorization', `Bearer ${token}`);

    const noNote = await auth(request(app).patch(`/api/questions/${draft.id}/review`)).send({ decision: 'reject' });
    expect(noNote.status).toBe(400);

    const rejected = await auth(request(app).patch(`/api/questions/${draft.id}/review`))
      .send({ decision: 'reject', note: 'Ambigua' });
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.active).toBe(false);
    expect(rejected.body.review_note).toBe('Ambigua');
    expect(await picked(draft.id)).toBe(false);
  });

  it('editar con approve aprueba en el mismo paso', async () => {
    const token = await authedTeacher();
    const draft = await draftOf(`¿Qué órgano impulsa la sangre? ${Date.now()}`);
    const res = await request(app).put(`/api/questions/${draft.id}`).set('Authorization', `Bearer ${token}`).send({
      subject: 'ciencias', grade_level: '5b', difficulty: 'easy', oa_code: 'OA4',
      text: `¿Qué órgano impulsa la sangre por el cuerpo? ${Date.now()}`,
      options: ['Corazón', 'Pulmón', 'Riñón', 'Estómago'], correct: 'Corazón', approve: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.active).toBe(true);
  });

  it('UTP puede revisar el banco; un alumno no', async () => {
    const utp = await createTeacher(pool, { roles: ['utp'] });
    const ok = await request(app).get('/api/questions').set('Authorization', `Bearer ${signToken(teacherPayload(utp))}`)
      .query({ status: 'draft' });
    expect(ok.status).toBe(200);

    const student = await createStudent(pool, { courseName: '5° Básico A' });
    const denied = await request(app).get('/api/questions').set('Authorization', `Bearer ${signToken(studentPayload(student))}`);
    expect(denied.status).toBe(403);
  });

  it('no elimina una pregunta que ya tiene respuestas de alumnos', async () => {
    const token = await authedTeacher();
    const q = await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', options: ['1', '2', '3', '4'], correct: '2' });
    const student = await createStudent(pool, { courseName: '5° Básico A' });
    const { rows: [session] } = await pool.query(
      `INSERT INTO game_sessions (game_type, subject, started_at) VALUES ('quiz_battle', 'matematica', NOW()) RETURNING id`
    );
    await pool.query(
      `INSERT INTO student_answers (session_id, student_id, question_index, question_id, answer, is_correct, time_taken_ms)
       VALUES ($1, $2, 0, $3, '2', true, 1000)`,
      [session.id, student.id, q.id]
    );
    const res = await request(app).delete(`/api/questions/${q.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});
