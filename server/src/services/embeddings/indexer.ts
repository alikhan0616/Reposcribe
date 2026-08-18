import { embedTexts } from './embedder';
import { ensureCollection, upsertChunks, searchCodebase, deleteRepoIndex } from './qdrant';
import type { CodeChunk, SearchHit } from '../../types';

export interface IndexOptions {
  /** Delete any existing index for these chunks' repo first (re-indexing). */
  replace?: boolean;
  /** Reports embedding progress (embedded so far / total). */
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Embeds chunks and upserts them into Qdrant. Ensures the collection exists.
 * Returns the number of chunks indexed.
 */
export async function indexChunks(
  chunks: CodeChunk[],
  options: IndexOptions = {},
): Promise<number> {
  if (chunks.length === 0) return 0;

  await ensureCollection();
  if (options.replace) {
    await deleteRepoIndex(chunks[0].repoId);
  }

  const vectors = await embedTexts(
    chunks.map((c) => c.text),
    { onProgress: options.onProgress },
  );
  await upsertChunks(chunks, vectors);
  return chunks.length;
}

/**
 * Embeds a natural-language query and runs semantic search within a repo.
 * This is the backing implementation for the agent's `search_codebase` tool.
 */
export async function queryCodebase(
  repoId: string,
  query: string,
  topK = 8,
): Promise<SearchHit[]> {
  const [vector] = await embedTexts([query]);
  return searchCodebase(repoId, vector, topK);
}
