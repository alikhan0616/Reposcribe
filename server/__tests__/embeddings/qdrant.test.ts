import {
  upsertChunks,
  searchCodebase,
  deleteRepoIndex,
  ensureCollection,
  pointIdFor,
} from '../../src/services/embeddings/qdrant';
import { env } from '../../src/config/env';
import type { CodeChunk } from '../../src/types';

function makeChunk(overrides: Partial<CodeChunk> = {}): CodeChunk {
  return {
    id: 'repo1:src/a.ts:0',
    text: 'export const a = 1;',
    repoId: 'repo1',
    filepath: 'src/a.ts',
    language: 'typescript',
    chunkIndex: 0,
    startLine: 1,
    endLine: 1,
    ...overrides,
  };
}

/** Minimal Qdrant client mock. */
function mockClient(overrides: Record<string, jest.Mock> = {}) {
  return {
    getCollections: jest.fn(async () => ({ collections: [] })),
    createCollection: jest.fn(async () => undefined),
    createPayloadIndex: jest.fn(async () => undefined),
    upsert: jest.fn(async () => undefined),
    search: jest.fn(async () => []),
    delete: jest.fn(async () => undefined),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('pointIdFor', () => {
  it('is deterministic and a valid UUID', () => {
    const a = pointIdFor('repo1:src/a.ts:0');
    const b = pointIdFor('repo1:src/a.ts:0');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(pointIdFor('repo1:src/a.ts:1')).not.toBe(a);
  });
});

describe('upsertChunks', () => {
  it('builds points whose payload matches the CodeChunk schema', async () => {
    const client = mockClient();
    const chunk = makeChunk();
    const vector = [0.1, 0.2, 0.3];

    await upsertChunks([chunk], [vector], client);

    expect(client.upsert).toHaveBeenCalledTimes(1);
    const [collection, body] = client.upsert.mock.calls[0];
    expect(collection).toBe(env.qdrantCollection);
    expect(body.wait).toBe(true);

    const point = body.points[0];
    expect(point.id).toBe(pointIdFor(chunk.id));
    expect(point.vector).toEqual(vector);
    expect(point.payload).toEqual({
      id: 'repo1:src/a.ts:0',
      text: 'export const a = 1;',
      repoId: 'repo1',
      filepath: 'src/a.ts',
      language: 'typescript',
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
    });
  });

  it('throws on a chunk/vector count mismatch', async () => {
    const client = mockClient();
    await expect(upsertChunks([makeChunk()], [], client)).rejects.toThrow(/mismatch/);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('is a no-op for empty input', async () => {
    const client = mockClient();
    await upsertChunks([], [], client);
    expect(client.upsert).not.toHaveBeenCalled();
  });
});

describe('searchCodebase', () => {
  it('filters by repoId and maps payload/score into SearchHits', async () => {
    const chunk = makeChunk();
    const client = mockClient({
      search: jest.fn(async () => [{ id: 'x', score: 0.87, payload: chunk }]),
    });

    const hits = await searchCodebase('repo1', [0.1, 0.2], 5, client);

    const [collection, params] = client.search.mock.calls[0];
    expect(collection).toBe(env.qdrantCollection);
    expect(params.limit).toBe(5);
    expect(params.with_payload).toBe(true);
    expect(params.filter).toEqual({ must: [{ key: 'repoId', match: { value: 'repo1' } }] });

    expect(hits).toEqual([{ chunk, score: 0.87 }]);
  });
});

describe('deleteRepoIndex', () => {
  it('deletes by repoId filter', async () => {
    const client = mockClient();
    await deleteRepoIndex('repo1', client);
    const [collection, params] = client.delete.mock.calls[0];
    expect(collection).toBe(env.qdrantCollection);
    expect(params.filter).toEqual({ must: [{ key: 'repoId', match: { value: 'repo1' } }] });
  });
});

describe('ensureCollection', () => {
  it('creates the collection + payload index when missing', async () => {
    const client = mockClient();
    await ensureCollection(client);
    expect(client.createCollection).toHaveBeenCalledWith(env.qdrantCollection, {
      vectors: { size: env.embeddingDim, distance: 'Cosine' },
    });
    expect(client.createPayloadIndex).toHaveBeenCalled();
  });

  it('does nothing when the collection already exists', async () => {
    const client = mockClient({
      getCollections: jest.fn(async () => ({
        collections: [{ name: env.qdrantCollection }],
      })),
    });
    await ensureCollection(client);
    expect(client.createCollection).not.toHaveBeenCalled();
  });
});
