import type { RedisLike } from '../../src/services/history/store';
import {
  registerUserRepo,
  listUserRepos,
  removeUserRepo,
  getChatHistory,
  appendChatTurns,
  clearChatHistory,
  buildUserRepoEntry,
  MAX_CHAT_TURNS,
} from '../../src/services/history/store';
import type { ChatTurn, UserRepoEntry } from '../../src/types';

/** In-memory RedisLike double covering the set / string / list ops the store uses. */
function makeFakeRedis(): RedisLike {
  const sets = new Map<string, Set<string>>();
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();
  return {
    async sadd(key, member) {
      const s = sets.get(key) ?? new Set();
      const had = s.has(member);
      s.add(member);
      sets.set(key, s);
      return had ? 0 : 1;
    },
    async srem(key, member) {
      const s = sets.get(key);
      if (!s) return 0;
      return s.delete(member) ? 1 : 0;
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
    async get(key) {
      return strings.get(key) ?? null;
    },
    async set(key, value) {
      strings.set(key, value);
      return 'OK';
    },
    async del(key) {
      const existed = strings.delete(key) || lists.delete(key) || sets.delete(key);
      return existed ? 1 : 0;
    },
    async rpush(key, value) {
      const l = lists.get(key) ?? [];
      l.push(value);
      lists.set(key, l);
      return l.length;
    },
    async lrange(key, start, stop) {
      const l = lists.get(key) ?? [];
      const end = stop === -1 ? l.length : stop + 1;
      return l.slice(start, end);
    },
    async ltrim(key, start, stop) {
      const l = lists.get(key) ?? [];
      const end = stop === -1 ? l.length : stop + 1;
      lists.set(key, l.slice(start < 0 ? l.length + start : start, end));
      return 'OK';
    },
  };
}

const entry: UserRepoEntry = {
  repoId: 'r1',
  repoUrl: 'https://github.com/acme/widget',
  name: 'acme/widget',
  indexedAt: '2026-01-01T00:00:00.000Z',
  fileCount: 3,
  chunkCount: 42,
};

describe('user repo registry', () => {
  it('registers then lists a repo', async () => {
    const r = makeFakeRedis();
    await registerUserRepo('u1', entry, r);
    expect(await listUserRepos('u1', r)).toEqual([entry]);
  });

  it('sorts repos newest-first by indexedAt', async () => {
    const r = makeFakeRedis();
    const older = { ...entry, repoId: 'r-old', indexedAt: '2025-01-01T00:00:00.000Z' };
    const newer = { ...entry, repoId: 'r-new', indexedAt: '2027-01-01T00:00:00.000Z' };
    await registerUserRepo('u1', older, r);
    await registerUserRepo('u1', newer, r);
    const ids = (await listUserRepos('u1', r)).map((e) => e.repoId);
    expect(ids).toEqual(['r-new', 'r-old']);
  });

  it('re-registering the same repoId overwrites metadata (no duplicates)', async () => {
    const r = makeFakeRedis();
    await registerUserRepo('u1', entry, r);
    await registerUserRepo('u1', { ...entry, chunkCount: 99 }, r);
    const list = await listUserRepos('u1', r);
    expect(list).toHaveLength(1);
    expect(list[0].chunkCount).toBe(99);
  });

  it('removeUserRepo drops it from the list', async () => {
    const r = makeFakeRedis();
    await registerUserRepo('u1', entry, r);
    await removeUserRepo('u1', 'r1', r);
    expect(await listUserRepos('u1', r)).toEqual([]);
  });

  it('scopes repos per user', async () => {
    const r = makeFakeRedis();
    await registerUserRepo('u1', entry, r);
    expect(await listUserRepos('u2', r)).toEqual([]);
  });

  it('is a no-op for the anonymous user', async () => {
    const r = makeFakeRedis();
    await registerUserRepo('anonymous', entry, r);
    expect(await listUserRepos('anonymous', r)).toEqual([]);
  });
});

describe('chat history', () => {
  const turns: ChatTurn[] = [
    { role: 'user', content: 'where is auth?', at: '2026-01-01T00:00:00.000Z' },
    {
      role: 'assistant',
      content: 'In src/auth.ts',
      citations: ['src/auth.ts:1-20'],
      at: '2026-01-01T00:00:01.000Z',
    },
  ];

  it('appends then reads turns in order', async () => {
    const r = makeFakeRedis();
    await appendChatTurns('u1', 'r1', turns, r);
    expect(await getChatHistory('u1', 'r1', r)).toEqual(turns);
  });

  it('accumulates across multiple appends', async () => {
    const r = makeFakeRedis();
    await appendChatTurns('u1', 'r1', [turns[0]], r);
    await appendChatTurns('u1', 'r1', [turns[1]], r);
    expect(await getChatHistory('u1', 'r1', r)).toHaveLength(2);
  });

  it('trims to the most recent MAX_CHAT_TURNS', async () => {
    const r = makeFakeRedis();
    const many: ChatTurn[] = Array.from({ length: MAX_CHAT_TURNS + 10 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
      at: new Date(i).toISOString(),
    }));
    await appendChatTurns('u1', 'r1', many, r);
    const stored = await getChatHistory('u1', 'r1', r);
    expect(stored).toHaveLength(MAX_CHAT_TURNS);
    // Oldest 10 dropped; last one retained.
    expect(stored[0].content).toBe('m10');
    expect(stored[stored.length - 1].content).toBe(`m${MAX_CHAT_TURNS + 9}`);
  });

  it('clearChatHistory empties the conversation', async () => {
    const r = makeFakeRedis();
    await appendChatTurns('u1', 'r1', turns, r);
    await clearChatHistory('u1', 'r1', r);
    expect(await getChatHistory('u1', 'r1', r)).toEqual([]);
  });

  it('scopes history per repo and per user', async () => {
    const r = makeFakeRedis();
    await appendChatTurns('u1', 'r1', turns, r);
    expect(await getChatHistory('u1', 'r2', r)).toEqual([]);
    expect(await getChatHistory('u2', 'r1', r)).toEqual([]);
  });

  it('is a no-op for the anonymous user', async () => {
    const r = makeFakeRedis();
    await appendChatTurns('anonymous', 'r1', turns, r);
    expect(await getChatHistory('anonymous', 'r1', r)).toEqual([]);
  });
});

describe('buildUserRepoEntry', () => {
  it('derives owner/repo name from the URL', () => {
    const built = buildUserRepoEntry({
      repoId: 'r1',
      repoUrl: 'https://github.com/acme/widget',
      fileCount: 3,
      chunkCount: 42,
      indexedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(built).toEqual(entry);
  });

  it('falls back to the URL when it is not a GitHub URL', () => {
    const built = buildUserRepoEntry({
      repoId: 'r1',
      repoUrl: 'not-a-url',
      fileCount: 0,
      chunkCount: 0,
    });
    expect(built.name).toBe('not-a-url');
  });
});
