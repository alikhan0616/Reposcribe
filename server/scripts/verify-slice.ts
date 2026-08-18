/**
 * Real end-to-end vertical-slice verification:
 *   clone → chunk → REAL HF embeddings → REAL Qdrant upsert → REAL OpenRouter answer.
 * S3 is stubbed (its write path is standard AWS SDK; MinIO covers it separately).
 * Run: npx tsx scripts/verify-slice.ts
 */
import { runIngestPipeline } from '../src/services/ingest';
import { runAgent } from '../src/services/agent';
import { deleteRepoIndex } from '../src/services/embeddings';

const REPO = process.env.VERIFY_REPO ?? 'https://github.com/sindresorhus/p-limit';
const QUESTION =
  process.env.VERIFY_Q ??
  'How does this library limit the number of concurrently running promises? Point to the specific code.';

async function main() {
  console.log(`Ingesting ${REPO} ...`);
  const { repoId, chunks } = await runIngestPipeline(REPO, {
    onProgress: (p) =>
      process.stdout.write(`\r  [${p.status}] ${p.processed ?? ''}/${p.total ?? ''}          `),
    deps: {
      uploadRawFile: async (id, fp) => `repos/${id}/raw/${fp}`,
      uploadManifest: async () => undefined,
    },
  });
  console.log(`\n  → repoId=${repoId}, ${chunks.length} chunks embedded + upserted to Qdrant.\n`);

  console.log(`Asking agent: "${QUESTION}"\n`);
  const result = await runAgent({ repoId, question: QUESTION });

  console.log('=== ANSWER ===');
  console.log(result.answer);
  console.log('\n=== CITATIONS ===');
  console.log(result.citations.join('\n') || '(none)');
  console.log('\n=== TOOL TRACE ===');
  for (const t of result.trace) {
    console.log(
      `  ${t.tool}  (${t.latencyMs}ms, ok=${t.ok})  ->  ${JSON.stringify(t.output).slice(0, 140)}`,
    );
  }

  await deleteRepoIndex(repoId);
  console.log('\n(cleaned up Qdrant index for this repo)');
}
main().catch((e) => {
  console.error('\nVERIFY FAILED:', e);
  process.exit(1);
});
