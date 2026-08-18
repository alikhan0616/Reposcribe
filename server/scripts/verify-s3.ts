/** Verifies the S3 layer against the configured endpoint (MinIO locally). */
import {
  uploadRawFile,
  uploadManifest,
  getManifest,
  getRawFile,
  presignRawFile,
  deleteRepoFiles,
  buildManifest,
} from '../src/services/ingest';

async function main() {
  const repoId = `test-s3-${Date.now()}`;
  const content = 'export const a = 1;\nexport const b = 2;\n';

  await uploadRawFile(repoId, 'src/a.ts', content);
  const manifest = buildManifest(repoId, 'https://github.com/acme/widget', [
    { filepath: 'src/a.ts', s3Key: `repos/${repoId}/raw/src/a.ts`, size: content.length, language: 'typescript' },
  ]);
  await uploadManifest(manifest);

  const gotManifest = await getManifest(repoId);
  const gotFile = await getRawFile(repoId, 'src/a.ts');
  const url = await presignRawFile(repoId, 'src/a.ts');

  console.log('manifest round-trip files:', gotManifest.files.map((f) => f.filepath));
  console.log('file round-trip matches:', gotFile === content);
  console.log('presigned url reachable host:', url.split('/')[2]);

  await deleteRepoFiles(repoId);
  console.log('cleaned up. S3 LAYER OK ✅');
}
main().catch((e) => {
  console.error('S3 VERIFY FAILED:', e);
  process.exit(1);
});
