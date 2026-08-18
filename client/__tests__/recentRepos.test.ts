import {
  getRecentRepos,
  addRecentRepo,
  removeRecentRepo,
  mergeRecentRepos,
  setCurrentRepoId,
  getCurrentRepoId,
  clearCurrentRepoId,
} from '@/lib/recentRepos';
import type { UserRepoEntry } from '@/lib/types';

const entry = (over: Partial<UserRepoEntry> = {}): UserRepoEntry => ({
  repoId: 'r1',
  repoUrl: 'https://github.com/acme/widget',
  name: 'acme/widget',
  indexedAt: '2026-01-01T00:00:00.000Z',
  fileCount: 3,
  chunkCount: 42,
  ...over,
});

beforeEach(() => window.localStorage.clear());

describe('recentRepos cache', () => {
  it('starts empty', () => {
    expect(getRecentRepos('u1')).toEqual([]);
  });

  it('adds and reads a repo', () => {
    addRecentRepo('u1', entry());
    expect(getRecentRepos('u1')).toEqual([entry()]);
  });

  it('dedups by repoId, most recent first', () => {
    addRecentRepo('u1', entry({ repoId: 'a', indexedAt: '2025-01-01T00:00:00.000Z' }));
    addRecentRepo('u1', entry({ repoId: 'b', indexedAt: '2027-01-01T00:00:00.000Z' }));
    addRecentRepo('u1', entry({ repoId: 'a', indexedAt: '2028-01-01T00:00:00.000Z' }));
    const ids = getRecentRepos('u1').map((e) => e.repoId);
    expect(ids).toEqual(['a', 'b']);
  });

  it('scopes per user', () => {
    addRecentRepo('u1', entry());
    expect(getRecentRepos('u2')).toEqual([]);
  });

  it('removes a repo', () => {
    addRecentRepo('u1', entry());
    removeRecentRepo('u1', 'r1');
    expect(getRecentRepos('u1')).toEqual([]);
  });

  it('merges server entries over local (server wins, local-only kept)', () => {
    addRecentRepo('u1', entry({ repoId: 'local-only' }));
    addRecentRepo('u1', entry({ repoId: 'shared', chunkCount: 1 }));
    const merged = mergeRecentRepos('u1', [entry({ repoId: 'shared', chunkCount: 999 })]);
    const shared = merged.find((e) => e.repoId === 'shared');
    expect(shared?.chunkCount).toBe(999);
    expect(merged.some((e) => e.repoId === 'local-only')).toBe(true);
  });

  it('tolerates corrupt storage', () => {
    window.localStorage.setItem('reposcribe:u1:repos', '{not json');
    expect(getRecentRepos('u1')).toEqual([]);
  });
});

describe('current repo persistence', () => {
  it('round-trips the open repo id', () => {
    setCurrentRepoId('u1', 'r9');
    expect(getCurrentRepoId('u1')).toBe('r9');
    clearCurrentRepoId('u1');
    expect(getCurrentRepoId('u1')).toBeNull();
  });

  it('removing the current repo clears the pointer', () => {
    addRecentRepo('u1', entry());
    setCurrentRepoId('u1', 'r1');
    removeRecentRepo('u1', 'r1');
    expect(getCurrentRepoId('u1')).toBeNull();
  });
});
