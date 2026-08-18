'use client';

import type { UserRepoEntry } from './types';

/**
 * Client-side cache of a user's indexed repos, in localStorage, namespaced by
 * user id. This is the whole story when auth is off (nothing is persisted
 * server-side); when auth is on it's a fast cache in front of the server's
 * Redis registry, and also remembers which repo was open so a reload or an
 * accidental "New repo" click doesn't strand the user on an empty screen.
 */

const listKey = (userId: string) => `reposcribe:${userId}:repos`;
const currentKey = (userId: string) => `reposcribe:${userId}:currentRepo`;

/** Guards every access — localStorage is absent during SSR and can throw. */
function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded / disabled — degrade silently; this is only a cache.
  }
}

function safeRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Reads the cached repo list (newest first), tolerating corrupt storage. */
export function getRecentRepos(userId: string): UserRepoEntry[] {
  const raw = safeGet(listKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as UserRepoEntry[])
      .filter((e) => e && typeof e.repoId === 'string')
      .sort((a, b) => (b.indexedAt ?? '').localeCompare(a.indexedAt ?? ''));
  } catch {
    return [];
  }
}

/** Adds or updates a repo in the cache (dedup by repoId), newest first. */
export function addRecentRepo(userId: string, entry: UserRepoEntry): UserRepoEntry[] {
  const existing = getRecentRepos(userId).filter((e) => e.repoId !== entry.repoId);
  const next = [entry, ...existing];
  safeSet(listKey(userId), JSON.stringify(next));
  return next;
}

/** Replaces the whole cached list (e.g. after hydrating from the server). */
export function setRecentRepos(userId: string, entries: UserRepoEntry[]): void {
  safeSet(listKey(userId), JSON.stringify(entries));
}

/** Removes one repo from the cache. */
export function removeRecentRepo(userId: string, repoId: string): UserRepoEntry[] {
  const next = getRecentRepos(userId).filter((e) => e.repoId !== repoId);
  safeSet(listKey(userId), JSON.stringify(next));
  if (getCurrentRepoId(userId) === repoId) clearCurrentRepoId(userId);
  return next;
}

/**
 * Merges a server-provided list with the local cache (server wins on conflict,
 * local-only entries are preserved), persists it, and returns the merged list.
 */
export function mergeRecentRepos(
  userId: string,
  serverEntries: UserRepoEntry[],
): UserRepoEntry[] {
  const byId = new Map<string, UserRepoEntry>();
  for (const e of getRecentRepos(userId)) byId.set(e.repoId, e);
  for (const e of serverEntries) byId.set(e.repoId, e); // server is source of truth
  const merged = [...byId.values()].sort((a, b) =>
    (b.indexedAt ?? '').localeCompare(a.indexedAt ?? ''),
  );
  setRecentRepos(userId, merged);
  return merged;
}

/** Remembers the currently-open repo so a reload restores the workspace. */
export function setCurrentRepoId(userId: string, repoId: string): void {
  safeSet(currentKey(userId), repoId);
}

export function getCurrentRepoId(userId: string): string | null {
  return safeGet(currentKey(userId));
}

export function clearCurrentRepoId(userId: string): void {
  safeRemove(currentKey(userId));
}
