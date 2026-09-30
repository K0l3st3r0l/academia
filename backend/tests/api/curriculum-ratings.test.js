import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { startTestServer } from '../helpers/socketServer.js';
import { createTeacher, createStudent, createRoom, createQuestion, createGameSession, signToken, teacherPayload } from '../helpers/fixtures.js';

const { default: pool } = await import('../../src/db/index.js');
const { syncCurriculum } = await import('../../src/services/curriculum.js');
const { rateAnswer, expectedCorrect, rateUnratedAnswers, findSuspiciousQuestions } = await import('../../src/services/skillRatings.js');

let testServer;

beforeAll(async () => {
  testServer = await startTestServer();
});

afterAll(async () => {
  await testServer.close();
});

const OPTIONS = ['Uno', 'Dos', 'Tres', 'Cuatro'];

async function seedAnswers({ question, students, answersPerStudent }) {
  const teacher = await createTeacher(pool);
  const room = await createRoom(pool, { teacherId: teacher.id, courseName: '5° Básico A', subject: question.subject });
  const session = await createGameSession(pool, { roomId: room.id, subject: question.subject });
  let index = 0;
  for (const [student, answers] of students.map((s, i) => [s, answersPerStudent[i]])) {
    for (const answer of answers) {
      await pool.query(
        `INSERT INTO student_answers (session_id, student_id, question_index, question_id, answer, is_correct, time_taken_ms)
         VALUES ($1, $2, $3, $4, $5, $6, 1000)`,
        [session.id, student.id, index++, question.id, answer, answer === question.correct]
      );
    }
  }
}

describe('puntaje de dificultad tipo Elo', () => {
  it('acertar lo esperado mueve poco; acertar una difícil sube la habilidad y baja la dificultad', () => {
    expect(expectedCorrect(0, 0)).toBeCloseTo(0.5);
    const fresh = { rating: 0, answers: 0 };
    const hardHit = rateAnswer({ subject: fresh, oa: fresh, question: { rating: 2, answers: 0 }, correct: true });
    const easyHit = rateAnswer({ subject: fresh, oa: fresh, question: { rating: -2, answers: 0 }, correct: true });
    expect(hardHit.subject).toBeGreaterThan(easyHit.subject);
    expect(hardHit.question).toBeLessThan(2);
    const miss = rateAnswer({ subject: fresh, oa: null, question: { rating: 0, answers: 0 }, correct: false });
    expect(miss.subject).toBeLessThan(0);
    expect(miss.question).toBeGreaterThan(0);
    expect(miss.oa).toBeNull();
  });

  it('procesa cada respuesta una sola vez y guarda puntaje por asignatura y por OA', async () => {
    const question = await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', options: OPTIONS, correct: 'Uno', oaCode: 'OA20' });
    const s1 = await createStudent(pool, { courseName: '5° Básico A' });
    const s2 = await createStudent(pool, { courseName: '5° Básico A' });
    await seedAnswers({ question, students: [s1, s2], answersPerStudent: [['Uno'], ['Dos']] });

    expect(await rateUnratedAnswers()).toBe(2);
    expect(await rateUnratedAnswers()).toBe(0);

    const { rows: [q] } = await pool.query('SELECT rating, rating_answers FROM questions WHERE id = $1', [question.id]);
    expect(q.rating_answers).toBe(2);

    const { rows: skills } = await pool.query(
      'SELECT student_id, grade_level, oa_code, rating, answers, correct FROM student_skill_ratings ORDER BY student_id, oa_code'
    );
    expect(skills).toHaveLength(4);
    const s1Subject = skills.find(s => s.student_id === s1.id && s.oa_code === '*');
    const s2Oa = skills.find(s => s.student_id === s2.id && s.oa_code === 'OA20');
    expect(s1Subject.rating).toBeGreaterThan(0);
    expect(s1Subject.correct).toBe(1);
    expect(s2Oa).toMatchObject({ grade_level: '5b', answers: 1, correct: 0 });
    expect(s2Oa.rating).toBeLessThan(0);
  });

  it('marca para revisión una pregunta bajo el azar con una respuesta incorrecta dominante', async () => {
    const question = await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', options: ['10', '100', '1', '1000'], correct: '10' });
    const students = await Promise.all(Array.from({ length: 10 }, () => createStudent(pool, { courseName: '5° Básico A' })));
    const answers = ['10', '100', '100', '100', '100', '100', '100', '100', '100', '1'].map(a => [a]);
    await seedAnswers({ question, students, answersPerStudent: answers });

    const flagged = await findSuspiciousQuestions();
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ id: question.id, pct_correct: 10, top_wrong_answer: '100', top_wrong_times: 8 });
  });
});

describe('GET /api/curriculum/:grade/:subject', () => {
  it('devuelve los 27 OA de matemática de 5° con la cantidad de preguntas activas', async () => {
    expect(await syncCurriculum()).toBe(109);
    await createQuestion(pool, { subject: 'matematica', gradeLevel: '5b', options: OPTIONS, correct: 'Uno', oaCode: 'OA20' });
    const token = signToken(teacherPayload(await createTeacher(pool)));

    const res = await request(testServer.server).get('/api/curriculum/5b/matematica').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.oas).toHaveLength(27);
    const oa20 = res.body.oas.find(o => o.code === 'OA20');
    expect(oa20).toMatchObject({ eje: 'Medición', label: 'Conversión de unidades de longitud', active_questions: 1, quiz: true, units: [2] });
    expect(res.body.oas.find(o => o.code === 'OA1').active_questions).toBe(0);
    expect(res.body.units.map(u => u.number)).toEqual([1, 2, 3, 4]);

    // English units are themes and its OA are worked all year.
    const english = await request(testServer.server).get('/api/curriculum/5b/ingles').set('Authorization', `Bearer ${token}`);
    expect(english.body.units[0].title).toBe('My world');
    expect(english.body.oas.every(o => o.all_year && o.units.length === 4)).toBe(true);
  });

  it('rechaza sin sesión y con curso o asignatura inválidos', async () => {
    expect((await request(testServer.server).get('/api/curriculum/5b/matematica')).status).toBe(401);
    const token = signToken(teacherPayload(await createTeacher(pool)));
    const bad = await request(testServer.server).get('/api/curriculum/5b/quimica').set('Authorization', `Bearer ${token}`);
    expect(bad.status).toBe(400);
  });
});
