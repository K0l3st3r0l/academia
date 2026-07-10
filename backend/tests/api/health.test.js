import { describe, it, expect } from 'vitest';
import request from 'supertest';

const { app } = await import('../../src/app.js');

describe('GET /health', () => {
  it('responde 200 con db ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(res.body).toHaveProperty('activeRooms');
    expect(res.body).toHaveProperty('connectedSockets');
    expect(res.body).toHaveProperty('uptimeSeconds');
    expect(res.body).toHaveProperty('version');
  });
});
