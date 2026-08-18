import request from 'supertest';
import type { AgentStreamEvent } from '../../src/services/agent/graph';

jest.mock('../../src/services/agent/graph', () => ({
  streamAgent: jest.fn(),
}));

jest.mock('../../src/services/history', () => ({
  getChatHistory: jest.fn(),
  appendChatTurns: jest.fn(async () => undefined),
  clearChatHistory: jest.fn(async () => undefined),
}));

import { createApp } from '../../src/app';
import { streamAgent } from '../../src/services/agent/graph';
import {
  getChatHistory,
  appendChatTurns,
  clearChatHistory,
} from '../../src/services/history';

const mockStream = streamAgent as jest.Mock;
const mockGetHistory = getChatHistory as jest.Mock;
const mockAppend = appendChatTurns as jest.Mock;
const mockClear = clearChatHistory as jest.Mock;
const app = createApp();

function events(...evs: AgentStreamEvent[]) {
  return async function* () {
    for (const e of evs) yield e;
  };
}

describe('POST /api/chat', () => {
  it('returns 400 when repoId or message is missing', async () => {
    const res = await request(app).post('/api/chat').send({ repoId: 'r1' });
    expect(res.status).toBe(400);
  });

  it('streams trace, citations, tokens, and done as SSE', async () => {
    mockStream.mockImplementation(
      events(
        { type: 'trace', call: { tool: 'router', input: {}, output: { intent: 'search' }, latencyMs: 5, ok: true } },
        { type: 'trace', call: { tool: 'search_codebase', input: {}, output: [], latencyMs: 3, ok: true } },
        { type: 'citations', citations: ['src/a.ts:10-30'] },
        { type: 'answer', answer: 'Auth lives in src/a.ts' },
      ),
    );

    const res = await request(app)
      .post('/api/chat')
      .send({ repoId: 'r1', message: 'where is auth?' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const body = res.text;
    expect(body).toContain('event: trace');
    expect(body).toContain('"tool":"router"');
    expect(body).toContain('event: citations');
    expect(body).toContain('src/a.ts:10-30');
    expect(body).toContain('event: token');
    expect(body).toContain('event: done');

    // The passed question + repoId reach the agent.
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'r1', question: 'where is auth?' }),
    );
  });

  it('emits an SSE error event when the agent throws', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app).post('/api/chat').send({ repoId: 'r1', message: 'q' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('boom');
  });

  it('persists the completed turn after a successful stream', async () => {
    mockAppend.mockClear();
    mockStream.mockImplementation(
      events(
        { type: 'citations', citations: ['src/a.ts:10-30'] },
        { type: 'answer', answer: 'Auth lives in src/a.ts' },
      ),
    );

    await request(app).post('/api/chat').send({ repoId: 'r1', message: 'where is auth?' });

    expect(mockAppend).toHaveBeenCalledTimes(1);
    const [userId, repoId, turns] = mockAppend.mock.calls[0];
    expect(userId).toBe('anonymous');
    expect(repoId).toBe('r1');
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ role: 'user', content: 'where is auth?' });
    expect(turns[1]).toMatchObject({
      role: 'assistant',
      content: 'Auth lives in src/a.ts',
      citations: ['src/a.ts:10-30'],
    });
  });
});

describe('GET /api/chat/:repoId/history', () => {
  beforeEach(() => mockGetHistory.mockReset());

  it("returns the user's persisted turns", async () => {
    const turns = [{ role: 'user', content: 'hi', at: '2026-01-01T00:00:00Z' }];
    mockGetHistory.mockResolvedValueOnce(turns);
    const res = await request(app).get('/api/chat/r1/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ turns });
  });

  it('degrades to empty turns when the store errors', async () => {
    mockGetHistory.mockRejectedValueOnce(new Error('redis down'));
    const res = await request(app).get('/api/chat/r1/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ turns: [] });
  });
});

describe('DELETE /api/chat/:repoId/history', () => {
  it('clears history and returns 204', async () => {
    mockClear.mockResolvedValueOnce(undefined);
    const res = await request(app).delete('/api/chat/r1/history');
    expect(res.status).toBe(204);
    expect(mockClear).toHaveBeenCalledWith('anonymous', 'r1');
  });
});
