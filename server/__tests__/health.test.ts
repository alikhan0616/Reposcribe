import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  const app = createApp();

  it('returns 200 with the health payload', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'reposcribe-server',
    });
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
