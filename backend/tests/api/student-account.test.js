import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createStudent } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');
const { institutionalEmail } = await import('../../src/utils/institutionalEmail.js');
const { _reset: resetRateLimiter } = await import('../../src/services/studentLoginRateLimiter.js');

let seq = 0;
beforeEach(() => {
  globalThis.__academiaOutbox = [];
  resetRateLimiter();
});

// Each test uses its own address: link quotas are per email and live in memory.
async function studentWithEmail(overrides = {}) {
  seq += 1;
  const email = overrides.email ?? `alumno${seq}.prueba.test@escuelaanahuac.cl`;
  const student = await createStudent(pool, { courseName: '5° Básico A', firstName: 'Sofía Andrea', ...overrides });
  await pool.query('UPDATE local_students SET institutional_email = $1 WHERE id = $2', [email, student.id]);
  return { ...student, email };
}

async function waitForMail(count = 1) {
  for (let i = 0; i < 50 && globalThis.__academiaOutbox.length < count; i++) {
    await new Promise(r => setTimeout(r, 20));
  }
  return globalThis.__academiaOutbox;
}

const tokenFrom = (mail) => /#t=([A-Za-z0-9_-]{43})/.exec(mail.text)[1];

async function requestLink(email) {
  return request(app).post('/api/student-account/olvide').send({ email });
}

describe('correo institucional calculado', () => {
  it('sigue la regla del colegio: sin tildes y ñ como n', () => {
    expect(institutionalEmail({ nombre1: 'José', apellido_paterno: 'Muñoz', apellido_materno: 'Pérez' }))
      .toBe('jose.munoz.perez@escuelaanahuac.cl');
    expect(institutionalEmail({ nombre1: 'ANA', apellido_paterno: 'Güemes', apellido_materno: '' }))
      .toBe('ana.guemes@escuelaanahuac.cl');
    expect(institutionalEmail({ nombre1: '', apellido_paterno: 'Soto', apellido_materno: 'Vera' })).toBeNull();
  });
});

describe('crear contraseña con enlace', () => {
  it('flujo completo: pide enlace, lo abre, crea la contraseña y queda con sesión', async () => {
    const student = await studentWithEmail();

    const asked = await requestLink(student.email.toUpperCase());
    expect(asked.status).toBe(200);
    const [mail] = await waitForMail();
    expect(mail.to[0].address).toBe(student.email);
    const token = tokenFrom(mail);

    const check = await request(app).post('/api/student-account/enlace').send({ token });
    expect(check.body).toMatchObject({ estado: 'valido', nombre: 'Sofía', email: student.email });

    const weak = await request(app).post('/api/student-account/crear').send({ token, password: 'corta' });
    expect(weak.status).toBe(400);

    const created = await request(app).post('/api/student-account/crear').send({ token, password: 'gato2024' });
    expect(created.status).toBe(200);
    expect(created.body.token).toBeTruthy();
    expect(created.body.student.id).toBe(student.id);

    const reused = await request(app).post('/api/student-account/crear').send({ token, password: 'perro2024' });
    expect(reused.status).toBe(410);

    const login = await request(app).post('/api/auth/student-email-login').send({ email: student.email, password: 'gato2024' });
    expect(login.status).toBe(200);
    expect(login.body.student.id).toBe(student.id);
  });

  it('responde lo mismo si el correo no es de ningún alumno, y no envía nada', async () => {
    const res = await requestLink('nadie.nadie.nadie@escuelaanahuac.cl');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Si el correo es de un alumno/);
    await new Promise(r => setTimeout(r, 100));
    expect(globalThis.__academiaOutbox).toHaveLength(0);
  });

  it('no envía enlace si dos alumnos activos comparten el correo (ficha duplicada)', async () => {
    const first = await studentWithEmail();
    await studentWithEmail({ email: first.email });

    const res = await requestLink(first.email);
    expect(res.status).toBe(200);
    await new Promise(r => setTimeout(r, 100));
    expect(globalThis.__academiaOutbox).toHaveLength(0);
  });

  it('no envía enlace a un alumno retirado', async () => {
    const student = await studentWithEmail();
    await pool.query('UPDATE local_students SET active = false WHERE id = $1', [student.id]);

    await requestLink(student.email);
    await new Promise(r => setTimeout(r, 100));
    expect(globalThis.__academiaOutbox).toHaveLength(0);
  });

  it('limita a 3 enlaces por correo en una hora', async () => {
    const student = await studentWithEmail();
    for (let i = 0; i < 3; i++) expect((await requestLink(student.email)).status).toBe(200);
    expect((await requestLink(student.email)).status).toBe(429);
  });

  it('un enlace nuevo deja sin efecto el anterior', async () => {
    const student = await studentWithEmail();
    await requestLink(student.email);
    await requestLink(student.email);
    const [older, newer] = await waitForMail(2);

    const oldCheck = await request(app).post('/api/student-account/enlace').send({ token: tokenFrom(older) });
    expect(oldCheck.body.estado).toBe('vencido');
    const newCheck = await request(app).post('/api/student-account/enlace').send({ token: tokenFrom(newer) });
    expect(newCheck.body.estado).toBe('valido');
  });

  it('un enlace vencido no sirve para crear la contraseña', async () => {
    const student = await studentWithEmail();
    await requestLink(student.email);
    const [mail] = await waitForMail();
    await pool.query("UPDATE student_password_tokens SET expires_at = NOW() - interval '1 minute'");

    const res = await request(app).post('/api/student-account/crear').send({ token: tokenFrom(mail), password: 'gato2024' });
    expect(res.status).toBe(410);
    expect(res.body.estado).toBe('vencido');
  });

  it('un token inventado devuelve 404', async () => {
    const res = await request(app).post('/api/student-account/crear').send({ token: 'x'.repeat(43), password: 'gato2024' });
    expect(res.status).toBe(404);
  });
});

describe('ingreso con correo y contraseña', () => {
  async function studentWithPassword() {
    const student = await studentWithEmail();
    await requestLink(student.email);
    const [mail] = await waitForMail();
    await request(app).post('/api/student-account/crear').send({ token: tokenFrom(mail), password: 'gato2024' });
    return student;
  }

  it('rechaza una contraseña incorrecta con un mensaje genérico', async () => {
    const student = await studentWithPassword();
    const res = await request(app).post('/api/auth/student-email-login').send({ email: student.email, password: 'otra2024' });
    expect(res.status).toBe(401);
  });

  it('un alumno retirado no entra aunque la contraseña sea correcta', async () => {
    const student = await studentWithPassword();
    await pool.query('UPDATE local_students SET active = false WHERE id = $1', [student.id]);
    const res = await request(app).post('/api/auth/student-email-login').send({ email: student.email, password: 'gato2024' });
    expect(res.status).toBe(403);
  });

  it('bloquea con 429 tras 5 intentos fallidos', async () => {
    const student = await studentWithPassword();
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/student-email-login').send({ email: student.email, password: 'mala1234' });
    }
    const res = await request(app).post('/api/auth/student-email-login').send({ email: student.email, password: 'gato2024' });
    expect(res.status).toBe(429);
  });

  it('la configuración informa que las cuentas con correo están disponibles', async () => {
    const res = await request(app).get('/api/auth/config');
    expect(res.body).toEqual({ studentEmailAccounts: true, institutionalDomain: 'escuelaanahuac.cl' });
  });
});
