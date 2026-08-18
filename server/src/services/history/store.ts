/**
 * Redis-backed persistence for a user's indexed-repo registry and per-repo chat
 * history. Source of truth when Clerk auth is enabled — lets a signed-in user
 * jump back into any repo they've indexed (on any device) without re-ingesting,
 * and resume the conversation where they left off.
 *
 * The client keeps a localStorage cache on top of this for speed and for the
 * no-auth (single anonymous user) case, where nothing is persisted server-side.
 *
 * We never import ioredis directly (its types conflict with BullMQ's bundled
 * copy — see CLAUDE.md); instead we borrow the ingest queue's own connection
 * through the minimal `RedisLike` surface below. The client is injectable so
 * tests run without a real Redis.
 */
import { getIngestQueue } from '../../workers/queue';
import { parseGitHubRepo } from '../agent/tools/github';
import type { ChatTurn, UserRepoEntry } from '../../types';

/** The subset of the Redis client this store needs. */
export interface RedisLike {
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
}

/** Cap the stored history so a runaway conversation can't grow unbounded. */
export const MAX_CHAT_TURNS = 500;

const reposKey = (userId: string) => `user:${userId}:repos`;
const repoMetaKey = (userId: string, repoId: string) => `user:${userId}:repo:${repoId}`;
const chatKey = (userId: string, repoId: string) => `chat:${userId}:${repoId}`;

/**
 * Resolves the Redis client from the BullMQ queue's connection. Overridable in
 * tests via `setRedisClient`.
 */
let clientOverride: RedisLike | null = null;

export function setRedisClient(client: RedisLike | null): void {
  clientOverride = client;
}

async function getRedis(): Promise<RedisLike> {
  if (clientOverride) return clientOverride;
  // BullMQ's `queue.client` resolves to its ioredis instance; it implements
  // every method in RedisLike. Cast through unknown to avoid dragging in the
  // conflicting bundled ioredis types.
  const client = await getIngestQueue().client;
  return client as unknown as RedisLike;
}

/**
 * Records a repo under a user's registry (idempotent — re-indexing the same
 * repoId just overwrites its metadata). No-op for the anonymous user, whose
 * data is never persisted server-side.
 */
export async function registerUserRepo(
  userId: string,
  entry: UserRepoEntry,
  redis?: RedisLike,
): Promise<void> {
  if (!userId || userId === 'anonymous') return;
  const r = redis ?? (await getRedis());
  await r.sadd(reposKey(userId), entry.repoId);
  await r.set(repoMetaKey(userId, entry.repoId), JSON.stringify(entry));
}

/**
 * Lists a user's indexed repos, newest first. Skips any registry members whose
 * metadata is missing (e.g. deleted out-of-band).
 */
export async function listUserRepos(
  userId: string,
  redis?: RedisLike,
): Promise<UserRepoEntry[]> {
  if (!userId || userId === 'anonymous') return [];
  const r = redis ?? (await getRedis());
  const ids = await r.smembers(reposKey(userId));
  const entries: UserRepoEntry[] = [];
  for (const id of ids) {
    const raw = await r.get(repoMetaKey(userId, id));
    if (!raw) continue;
    try {
      entries.push(JSON.parse(raw) as UserRepoEntry);
    } catch {
      // Skip a corrupt entry rather than failing the whole list.
    }
  }
  return entries.sort((a, b) => b.indexedAt.localeCompare(a.indexedAt));
}

/** Removes a repo from a user's registry (metadata + membership). */
export async function removeUserRepo(
  userId: string,
  repoId: string,
  redis?: RedisLike,
): Promise<void> {
  if (!userId || userId === 'anonymous') return;
  const r = redis ?? (await getRedis());
  await r.srem(reposKey(userId), repoId);
  await r.del(repoMetaKey(userId, repoId));
}

/** Returns the persisted chat turns for a user's repo (oldest first). */
export async function getChatHistory(
  userId: string,
  repoId: string,
  redis?: RedisLike,
): Promise<ChatTurn[]> {
  if (!userId || userId === 'anonymous') return [];
  const r = redis ?? (await getRedis());
  const raws = await r.lrange(chatKey(userId, repoId), 0, -1);
  const turns: ChatTurn[] = [];
  for (const raw of raws) {
    try {
      turns.push(JSON.parse(raw) as ChatTurn);
    } catch {
      // Skip a corrupt turn.
    }
  }
  return turns;
}

/**
 * Appends one or more turns to a repo's history, trimming to the most recent
 * MAX_CHAT_TURNS so it never grows without bound.
 */
export async function appendChatTurns(
  userId: string,
  repoId: string,
  turns: ChatTurn[],
  redis?: RedisLike,
): Promise<void> {
  if (!userId || userId === 'anonymous' || turns.length === 0) return;
  const r = redis ?? (await getRedis());
  const key = chatKey(userId, repoId);
  for (const turn of turns) {
    await r.rpush(key, JSON.stringify(turn));
  }
  await r.ltrim(key, -MAX_CHAT_TURNS, -1);
}

/** Clears a repo's chat history for a user. */
export async function clearChatHistory(
  userId: string,
  repoId: string,
  redis?: RedisLike,
): Promise<void> {
  if (!userId || userId === 'anonymous') return;
  const r = redis ?? (await getRedis());
  await r.del(chatKey(userId, repoId));
}

/** Builds a registry entry from ingest results (derives a display name from the URL). */
export function buildUserRepoEntry(fields: {
  repoId: string;
  repoUrl: string;
  fileCount: number;
  chunkCount: number;
  indexedAt?: string;
}): UserRepoEntry {
  return {
    repoId: fields.repoId,
    repoUrl: fields.repoUrl,
    name: parseGitHubRepo(fields.repoUrl) ?? fields.repoUrl,
    indexedAt: fields.indexedAt ?? new Date().toISOString(),
    fileCount: fields.fileCount,
    chunkCount: fields.chunkCount,
  };
}
