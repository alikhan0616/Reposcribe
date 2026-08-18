import { Worker } from 'bullmq';
import { INGEST_QUEUE, getRedisConnectionOptions } from './queue';
import { runIngestPipeline } from '../services/ingest';
import { metrics } from '../services/metrics';
import { registerUserRepo, buildUserRepoEntry } from '../services/history';
import type { IngestJobData, IngestJobResult, IngestProgress } from '../types';

/**
 * Processes ingestion jobs: runs the clone → S3 → chunk pipeline and reports
 * progress back to BullMQ so the API can stream it to the client.
 *
 * NOTE: Phase 3 will embed `result.chunks` and upsert them into Qdrant here.
 */
export function createIngestWorker(): Worker<IngestJobData, IngestJobResult> {
  return new Worker<IngestJobData, IngestJobResult>(
    INGEST_QUEUE,
    async (job) => {
      const { repoUrl, userId } = job.data;
      const start = Date.now();
      try {
        const result = await runIngestPipeline(repoUrl, {
          ownerUserId: userId,
          onProgress: (p: IngestProgress) => {
            void job.updateProgress(p);
          },
        });
        metrics.incr('ingest.completed');
        metrics.observe('ingest.duration_ms', Date.now() - start);
        metrics.observe('ingest.files', result.manifest.fileCount);
        metrics.observe('ingest.chunks', result.chunks.length);

        // Register the repo under its owner so they can re-open it later without
        // re-ingesting. No-op for the anonymous user (no server-side persistence).
        if (userId) {
          try {
            await registerUserRepo(
              userId,
              buildUserRepoEntry({
                repoId: result.repoId,
                repoUrl,
                fileCount: result.manifest.fileCount,
                chunkCount: result.chunks.length,
                indexedAt: result.manifest.createdAt,
              }),
            );
          } catch (e) {
            // Non-fatal: ingestion succeeded; registry is a convenience layer.
            console.error('[ingest.worker] failed to register user repo', e);
          }
        }

        return {
          repoId: result.repoId,
          chunkCount: result.chunks.length,
          fileCount: result.manifest.fileCount,
        };
      } catch (e) {
        metrics.incr('ingest.failed');
        throw e;
      }
    },
    { connection: getRedisConnectionOptions(), concurrency: 2 },
  );
}
