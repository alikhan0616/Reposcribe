import { promises as fs } from 'fs';
import pLimit from 'p-limit';
import { cloneRepo, cleanupClone } from './clone';
import { walkRepo } from './filter';
import { chunkFile } from './chunker';
import { buildManifest } from './manifest';
import { uploadRawFile, uploadManifest, rawKey } from './s3';
import { languageForFile } from './languages';
import { indexChunks } from '../embeddings';
import { UPLOAD_CONCURRENCY, MAX_FILES, MAX_TOTAL_BYTES } from '../../config/ingest';
import type {
  CodeChunk,
  IngestProgress,
  ManifestEntry,
  RepoManifest,
} from '../../types';

export class RepoTooLargeError extends Error {}

/**
 * Injectable side-effecting dependencies, so the orchestration can be tested
 * without git/S3. Defaults are the real implementations.
 */
export interface IngestDeps {
  clone: typeof cloneRepo;
  cleanup: typeof cleanupClone;
  walk: typeof walkRepo;
  readFile: (absPath: string) => Promise<string>;
  uploadRawFile: typeof uploadRawFile;
  uploadManifest: typeof uploadManifest;
  /** Embeds chunks + upserts them into Qdrant. Returns count indexed. */
  indexChunks: (
    chunks: CodeChunk[],
    onProgress: (processed: number, total: number) => void,
  ) => Promise<number>;
}

const defaultDeps: IngestDeps = {
  clone: cloneRepo,
  cleanup: cleanupClone,
  walk: walkRepo,
  readFile: (absPath) => fs.readFile(absPath, 'utf8'),
  uploadRawFile,
  uploadManifest,
  indexChunks: (chunks, onProgress) => indexChunks(chunks, { onProgress }),
};

export interface RunIngestOptions {
  repoId?: string;
  /** Clerk user id to record as the repo owner (when auth is enabled). */
  ownerUserId?: string;
  onProgress?: (p: IngestProgress) => void;
  deps?: Partial<IngestDeps>;
}

export interface IngestResult {
  repoId: string;
  manifest: RepoManifest;
  chunks: CodeChunk[];
}

/**
 * Full ingestion pipeline: clone → filter → upload (concurrent) → manifest →
 * chunk. Emits progress and always cleans up the temp clone. Chunks are
 * returned in memory for the caller (the worker) to embed in Phase 3.
 */
export async function runIngestPipeline(
  repoUrl: string,
  options: RunIngestOptions = {},
): Promise<IngestResult> {
  const deps: IngestDeps = { ...defaultDeps, ...options.deps };
  const onProgress = options.onProgress ?? (() => {});

  onProgress({ status: 'cloning' });
  const { repoId, dir } = await deps.clone(repoUrl, options.repoId);

  try {
    const files = await deps.walk(dir);

    if (files.length > MAX_FILES) {
      throw new RepoTooLargeError(
        `Repo has ${files.length} indexable files (limit ${MAX_FILES}).`,
      );
    }
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new RepoTooLargeError(
        `Repo is ${totalBytes} bytes of indexable code (limit ${MAX_TOTAL_BYTES}).`,
      );
    }

    // --- Upload phase (concurrent) ---
    const contents = new Map<string, string>();
    const entries: ManifestEntry[] = [];
    const limit = pLimit(UPLOAD_CONCURRENCY);
    let uploaded = 0;

    onProgress({ status: 'uploading', processed: 0, total: files.length });
    await Promise.all(
      files.map((f) =>
        limit(async () => {
          const content = await deps.readFile(f.absPath);
          contents.set(f.relPath, content);
          await deps.uploadRawFile(repoId, f.relPath, content);
          entries.push({
            filepath: f.relPath,
            s3Key: rawKey(repoId, f.relPath),
            size: f.size,
            language: languageForFile(f.relPath)?.display ?? 'text',
          });
          uploaded += 1;
          onProgress({ status: 'uploading', processed: uploaded, total: files.length });
        }),
      ),
    );

    const manifest = buildManifest(repoId, repoUrl, entries, options.ownerUserId);
    await deps.uploadManifest(manifest);

    // --- Chunk phase (deterministic order) ---
    onProgress({ status: 'chunking', processed: 0, total: manifest.fileCount });
    const chunks: CodeChunk[] = [];
    let chunkedFiles = 0;
    for (const entry of manifest.files) {
      const content = contents.get(entry.filepath) ?? '';
      const fileChunks = await chunkFile(repoId, entry.filepath, content);
      chunks.push(...fileChunks);
      chunkedFiles += 1;
      onProgress({ status: 'chunking', processed: chunkedFiles, total: manifest.fileCount });
    }

    // --- Embed + index phase ---
    if (chunks.length > 0) {
      onProgress({ status: 'embedding', processed: 0, total: chunks.length });
      await deps.indexChunks(chunks, (processed, total) => {
        onProgress({ status: 'embedding', processed, total });
      });
    }

    onProgress({ status: 'done' });
    return { repoId, manifest, chunks };
  } finally {
    // Always clean up the temp clone, success or failure.
    await deps.cleanup(dir).catch(() => undefined);
  }
}
