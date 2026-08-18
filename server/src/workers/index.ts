import { createIngestWorker } from './ingest.worker';

const worker = createIngestWorker();

worker.on('completed', (job, result) => {
  console.log(
    `[worker] job ${job.id} completed: repoId=${result.repoId} files=${result.fileCount} chunks=${result.chunkCount}`,
  );
});

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[worker] error:', err.message);
});

console.log('[worker] ingestion worker started, waiting for jobs…');
