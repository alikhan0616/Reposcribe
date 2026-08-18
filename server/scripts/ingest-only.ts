/** Ingests a repo into Qdrant (stubbing S3) and prints the repoId. Keeps the index. */
import { runIngestPipeline } from '../src/services/ingest';

const REPO = process.env.VERIFY_REPO ?? 'https://github.com/sindresorhus/p-limit';

runIngestPipeline(REPO, {
  deps: {
    uploadRawFile: async (id, fp) => `repos/${id}/raw/${fp}`,
    uploadManifest: async () => undefined,
  },
})
  .then(({ repoId, chunks }) => {
    console.log(`REPO_ID=${repoId}`);
    console.log(`CHUNKS=${chunks.length}`);
  })
  .catch((e) => {
    console.error('INGEST FAILED', e);
    process.exit(1);
  });
