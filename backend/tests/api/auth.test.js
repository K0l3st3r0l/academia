import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createAnahuacStub } from '../helpers/anahuacStub.js';

// ANAHUAC_API_URL is read once at module-load time inside anahuacService.js,
// so the stub must be up and the env var set before src/app.js is imported.
const stub = createAnahuacStub();
process.env.ANAHUAC_API_URL = await stub.start();

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

afterAll(() => stub.stop());

describe('POST /api/auth/login', () => {
  it('inicia sesión y emite un JWT propio de AcademIA', async () => {
    stub.set('POST /api/users/login', () => ({ status: 200, body: { token: 'anahuac-fake-token' } }));
    stub.set('GET /api/users/me', () => ({
      status: 200,
      body: { id: 4242, email: 'profe@colegio.cl', first_name: 'Marcela', last_name: 'Rojas', roles: ['teacher'] },
    }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'profe@colegio.cl', password: 'secreto123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: 'profe@colegio.cl',
      first_name: 'Marcela',
      last_name: 'Rojas',
      roles: ['teacher'],
    });

    const { rows } = await pool.query('SELECT * FROM local_users WHERE anahuac_id = $1', [4242]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('profe@colegio.cl');
  });

  it('rechaza credenciales inválidas con 401', async () => {
    stub.set('POST /api/users/login', () => ({ status: 401, body: { error: 'Credenciales inválidas' } }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'profe@colegio.cl', password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('devuelve 400 si faltan credenciales', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'solo-email@colegio.cl' });
    expect(res.status).toBe(400);
  });
});
