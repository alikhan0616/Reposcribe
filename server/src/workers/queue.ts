import { Queue, ConnectionOptions } from 'bullmq';
import { env } from '../config/env';
import type { IngestJobData } from '../types';

export const INGEST_QUEUE = 'ingest';

/**
 * Builds BullMQ connection options from the Redis URL. We pass a plain options
 * object (not an ioredis instance) so BullMQ constructs the client with its own
 * bundled ioredis — avoiding cross-copy type conflicts. `maxRetriesPerRequest`
 * must be null for BullMQ.
 */
export function getRedisConnectionOptions(): ConnectionOptions {
  const u = new URL(env.redisUrl);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

let queue: Queue<IngestJobData> | null = null;

/** Lazily-constructed singleton ingestion queue (used by the API layer). */
export function getIngestQueue(): Queue<IngestJobData> {
  if (queue) return queue;
  queue = new Queue<IngestJobData>(INGEST_QUEUE, {
    connection: getRedisConnectionOptions(),
  });
  return queue;
}
