'use client';

import type { ChatMessage, ChatTurn } from './types';

/**
 * Client-side cache of a repo's chat, in localStorage, namespaced by user id
 * and repo id. Mirrors `recentRepos`: it's the whole story when auth is off,
 * and a fast cache in front of the server's Redis history when auth is on.
 *
 * We store the lightweight `ChatTurn` shape (role/content/citations) rather
 * than the full `ChatMessage` — tool traces are transient debug data and not
 * worth persisting. Restored messages therefore have empty traces.
 */

const key = (userId: string, repoId: string) => `reposcribe:${userId}:chat:${repoId}`;

const MAX_TURNS = 500;

function safeGet(k: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeSet(k: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(k, value);
  } catch {
    // ignore quota / disabled storage
  }
}

function safeRemove(k: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/** Reads cached turns for a repo, tolerating corrupt storage. */
export function getCachedTurns(userId: string, repoId: string): ChatTurn[] {
  const raw = safeGet(key(userId, repoId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatTurn[]) : [];
  } catch {
    return [];
  }
}

/** Overwrites the cached turns for a repo (trimmed to the most recent MAX_TURNS). */
export function setCachedTurns(userId: string, repoId: string, turns: ChatTurn[]): void {
  safeSet(key(userId, repoId), JSON.stringify(turns.slice(-MAX_TURNS)));
}

/** Appends turns to the cache. */
export function appendCachedTurns(userId: string, repoId: string, turns: ChatTurn[]): void {
  if (turns.length === 0) return;
  setCachedTurns(userId, repoId, [...getCachedTurns(userId, repoId), ...turns]);
}

/** Clears cached turns for a repo. */
export function clearCachedTurns(userId: string, repoId: string): void {
  safeRemove(key(userId, repoId));
}

let idCounter = 0;

/** Rehydrates persisted turns into renderable chat messages (no traces). */
export function turnsToMessages(turns: ChatTurn[]): ChatMessage[] {
  return turns.map((t) => ({
    id: `h${t.at}_${idCounter++}`,
    role: t.role,
    content: t.content,
    trace: [],
    citations: t.citations ?? [],
    streaming: false,
  }));
}
