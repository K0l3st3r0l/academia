import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTeacher, signToken, teacherPayload } from '../helpers/fixtures.js';

const { app } = await import('../../src/app.js');
const { default: pool } = await import('../../src/db/index.js');

const protectedRoutes = [
  { method: 'get', url: '/api/questions' },
  { method: 'get', url: '/api/rooms/history' },
  { method: 'post', url: '/api/rooms' },
];

describe('rutas protegidas', () => {
  for (const { method, url } of protectedRoutes) {
    it(`${method.toUpperCase()} ${url} devuelve 401 sin token`, async () => {
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
    });

    it(`${method.toUpperCase()} ${url} devuelve 403 sin rol docente`, async () => {
      const student = await createTeacher(pool, { roles: ['student'] });
      const token = signToken(teacherPayload(student));

      const res = await request(app)[method](url).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  }
});
