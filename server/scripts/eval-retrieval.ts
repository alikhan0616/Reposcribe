/**
 * Quantifies retrieval quality on a labeled query set (Recall@k + MRR).
 * Real HF embeddings + real Qdrant. Prints numbers for the README.
 */
import { runIngestPipeline } from '../src/services/ingest';
import { queryCodebase, deleteRepoIndex } from '../src/services/embeddings';

const REPO = 'https://github.com/sindresorhus/p-limit';

/** query → substring the correct file path should contain. */
const LABELS: Array<{ q: string; expect: string }> = [
  { q: 'how does it limit the number of concurrently running promises', expect: 'index.js' },
  { q: 'TypeScript type definitions for the limit function', expect: 'index.d.ts' },
  { q: 'installation and usage instructions', expect: 'readme.md' },
  { q: 'unit tests for concurrency behavior', expect: 'test.js' },
  { q: 'performance benchmark comparison', expect: 'benchmark.js' },
  { q: 'how to clear the pending queue of tasks', expect: 'index.js' },
  { q: 'number of currently active running promises', expect: 'index.js' },
  { q: 'recipes and advanced examples', expect: 'recipes.md' },
];

const TOP_K = 8;

async function main() {
  const { repoId } = await runIngestPipeline(REPO, {
    deps: { uploadRawFile: async (i, f) => `repos/${i}/raw/${f}`, uploadManifest: async () => undefined },
  });

  let recallAt1 = 0;
  let recallAt3 = 0;
  let recallAt5 = 0;
  let mrrSum = 0;
  const latencies: number[] = [];

  for (const { q, expect } of LABELS) {
    const t0 = Date.now();
    const hits = await queryCodebase(repoId, q, TOP_K);
    latencies.push(Date.now() - t0);
    const rank = hits.findIndex((h) => h.chunk.filepath.includes(expect)) + 1; // 0 = miss
    if (rank === 1) recallAt1++;
    if (rank >= 1 && rank <= 3) recallAt3++;
    if (rank >= 1 && rank <= 5) recallAt5++;
    if (rank >= 1) mrrSum += 1 / rank;
    console.log(`  rank=${rank || 'miss'}  "${q}" → expected ${expect}`);
  }

  const n = LABELS.length;
  const avgLat = Math.round(latencies.reduce((a, b) => a + b, 0) / n);
  console.log('\n=== RETRIEVAL EVAL (n=%d, top-%d) ===', n, TOP_K);
  console.log(`Recall@1: ${((recallAt1 / n) * 100).toFixed(0)}%`);
  console.log(`Recall@3: ${((recallAt3 / n) * 100).toFixed(0)}%`);
  console.log(`Recall@5: ${((recallAt5 / n) * 100).toFixed(0)}%`);
  console.log(`MRR:      ${(mrrSum / n).toFixed(3)}`);
  console.log(`avg query latency: ${avgLat} ms`);

  await deleteRepoIndex(repoId);
}
main().catch((e) => {
  console.error('EVAL FAILED', e);
  process.exit(1);
});
