/**
 * Verifies rate limiting is actually wired up. The rest of the suite runs with
 * limiting auto-disabled (see `env.rateLimit.enabled`), so this file forces it
 * ON — via `./rateLimit.env`, which sets the env vars BEFORE `config/env.ts`
 * reads them. That import must come first; it's a bare side-effect import, so
 * it executes ahead of the `../../src/app` import even though both are hoisted.
 */
import request from 'supertest';
import './rateLimit.env'; // must precede the app import — sets rate-limit env first
import { createApp } from '../../src/app';
import { streamAgent } from '../../src/services/agent/graph';
import type { AgentStreamEvent } from '../../src/services/agent/graph';

jest.mock('../../src/services/agent/graph', () => ({
  streamAgent: jest.fn(),
}));

jest.mock('../../src/services/history', () => ({
  getChatHistory: jest.fn(),
  appendChatTurns: jest.fn(async () => undefined),
  clearChatHistory: jest.fn(async () => undefined),
}));

const mockStream = streamAgent as unknown as jest.Mock;
const app = createApp();

function oneAnswer(): () => AsyncGenerator<AgentStreamEvent> {
  return async function* () {
    yield { type: 'answer', answer: 'ok' } as AgentStreamEvent;
  };
}

afterAll(() => {
  // Don't let the forced-on config leak into another suite in this worker.
  delete process.env.RATE_LIMIT_ENABLED;
  delete process.env.RATE_LIMIT_CHAT_MAX;
  delete process.env.RATE_LIMIT_GLOBAL_MAX;
});

describe('rate limiting: POST /api/chat', () => {
  beforeEach(() => mockStream.mockImplementation(oneAnswer()));

  it('allows requests up to the cap, then returns 429', async () => {
    const send = () =>
      request(app).post('/api/chat').send({ repoId: 'r1', message: 'hi' });

    // First 3 (RATE_LIMIT_CHAT_MAX) succeed…
    for (let i = 0; i < 3; i++) {
      const res = await send();
      expect(res.status).toBe(200);
    }

    // …the 4th is blocked with a JSON 429.
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Too many messages, slow down a moment.' });

    // Standard RateLimit-* headers are advertised to clients.
    expect(blocked.headers).toHaveProperty('ratelimit-limit');
  });
});
