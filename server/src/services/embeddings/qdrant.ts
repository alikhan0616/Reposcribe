import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import { env } from '../../config/env';
import { metrics } from '../metrics';
import type { CodeChunk, SearchHit } from '../../types';

/** Deterministic namespace so a chunk's Qdrant point id is stable across re-indexing. */
const POINT_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/** Qdrant point ids must be uint or UUID; derive a stable UUID from the chunk id. */
export function pointIdFor(chunkId: string): string {
  return uuidv5(chunkId, POINT_ID_NAMESPACE);
}

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    // Only send the API key over https (Qdrant Cloud); avoids the noisy
    // "Api key is used with unsecure connection" warning against a local http instance.
    const useApiKey = env.qdrantApiKey && env.qdrantUrl.startsWith('https');
    client = new QdrantClient({
      url: env.qdrantUrl,
      ...(useApiKey ? { apiKey: env.qdrantApiKey } : {}),
      checkCompatibility: false,
    });
  }
  return client;
}

/** Filter clause restricting a query to a single repo. */
function repoFilter(repoId: string) {
  return { must: [{ key: 'repoId', match: { value: repoId } }] };
}

/**
 * Creates the single shared collection (with a keyword payload index on
 * `repoId`) if it doesn't already exist. Idempotent.
 */
export async function ensureCollection(qdrant: QdrantClient = getQdrantClient()): Promise<void> {
  const { collections } = await qdrant.getCollections();
  if (collections.some((c) => c.name === env.qdrantCollection)) return;

  await qdrant.createCollection(env.qdrantCollection, {
    vectors: { size: env.embeddingDim, distance: 'Cosine' },
  });
  await qdrant
    .createPayloadIndex(env.qdrantCollection, {
      field_name: 'repoId',
      field_schema: 'keyword',
    })
    .catch(() => undefined);
}

/** Upserts chunks + their vectors as points. Payload carries full chunk metadata. */
export async function upsertChunks(
  chunks: CodeChunk[],
  vectors: number[][],
  qdrant: QdrantClient = getQdrantClient(),
): Promise<void> {
  if (chunks.length === 0) return;
  if (chunks.length !== vectors.length) {
    throw new Error(
      `chunk/vector count mismatch: ${chunks.length} chunks vs ${vectors.length} vectors`,
    );
  }

  const points = chunks.map((chunk, i) => ({
    id: pointIdFor(chunk.id),
    vector: vectors[i],
    payload: { ...chunk },
  }));

  await qdrant.upsert(env.qdrantCollection, { wait: true, points });
}

/** Semantic search within one repo. Returns hits with full chunk payload + score. */
export async function searchCodebase(
  repoId: string,
  vector: number[],
  topK = 8,
  qdrant: QdrantClient = getQdrantClient(),
): Promise<SearchHit[]> {
  const t0 = Date.now();
  const results = await qdrant.search(env.qdrantCollection, {
    vector,
    limit: topK,
    filter: repoFilter(repoId),
    with_payload: true,
  });
  metrics.observe('qdrant.search_latency_ms', Date.now() - t0);

  return results.map((r) => ({
    chunk: r.payload as unknown as CodeChunk,
    score: r.score,
  }));
}

/** Counts how many chunks are indexed for a repo. */
export async function countRepoChunks(
  repoId: string,
  qdrant: QdrantClient = getQdrantClient(),
): Promise<number> {
  const res = await qdrant.count(env.qdrantCollection, { filter: repoFilter(repoId) });
  return res.count;
}

/** Deletes every point belonging to a repo (for re-indexing / cleanup). */
export async function deleteRepoIndex(
  repoId: string,
  qdrant: QdrantClient = getQdrantClient(),
): Promise<void> {
  await qdrant.delete(env.qdrantCollection, {
    wait: true,
    filter: repoFilter(repoId),
  });
}
