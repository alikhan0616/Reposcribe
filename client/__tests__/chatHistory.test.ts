import {
  getCachedTurns,
  setCachedTurns,
  appendCachedTurns,
  clearCachedTurns,
  turnsToMessages,
} from '@/lib/chatHistory';
import type { ChatTurn } from '@/lib/types';

const turn = (over: Partial<ChatTurn> = {}): ChatTurn => ({
  role: 'user',
  content: 'hello',
  at: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => window.localStorage.clear());

describe('chatHistory cache', () => {
  it('starts empty', () => {
    expect(getCachedTurns('u1', 'r1')).toEqual([]);
  });

  it('sets and reads turns', () => {
    setCachedTurns('u1', 'r1', [turn()]);
    expect(getCachedTurns('u1', 'r1')).toEqual([turn()]);
  });

  it('appends turns', () => {
    appendCachedTurns('u1', 'r1', [turn({ content: 'a' })]);
    appendCachedTurns('u1', 'r1', [turn({ content: 'b' })]);
    expect(getCachedTurns('u1', 'r1').map((t) => t.content)).toEqual(['a', 'b']);
  });

  it('scopes per user and per repo', () => {
    setCachedTurns('u1', 'r1', [turn()]);
    expect(getCachedTurns('u1', 'r2')).toEqual([]);
    expect(getCachedTurns('u2', 'r1')).toEqual([]);
  });

  it('clears turns', () => {
    setCachedTurns('u1', 'r1', [turn()]);
    clearCachedTurns('u1', 'r1');
    expect(getCachedTurns('u1', 'r1')).toEqual([]);
  });

  it('tolerates corrupt storage', () => {
    window.localStorage.setItem('reposcribe:u1:chat:r1', 'nope');
    expect(getCachedTurns('u1', 'r1')).toEqual([]);
  });
});

describe('turnsToMessages', () => {
  it('rehydrates turns into renderable messages with citations, empty traces', () => {
    const msgs = turnsToMessages([
      turn({ role: 'user', content: 'q' }),
      turn({ role: 'assistant', content: 'a', citations: ['src/a.ts:1-5'] }),
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'q', trace: [], streaming: false });
    expect(msgs[1]).toMatchObject({ role: 'assistant', content: 'a', citations: ['src/a.ts:1-5'] });
    // Unique ids so React keys don't collide.
    expect(msgs[0].id).not.toBe(msgs[1].id);
  });
});
