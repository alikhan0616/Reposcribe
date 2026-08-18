/** Builds the sandbox image (first run) and runs the linter in an isolated container. */
import { uploadRawFile, deleteRepoFiles } from '../src/services/ingest';
import { runLinter } from '../src/services/sandbox';

async function main() {
  const repoId = `sbx-${Date.now()}`;
  const code = `let unusedVar = 5;\nfunction neverCalled() {\n  return 42;\n}\n`;
  await uploadRawFile(repoId, 'bad.js', code);

  console.log('Building sandbox image (first run may take ~1-2 min) + running linter…');
  const res = await runLinter(repoId, 'bad.js');

  console.log('command :', res.command);
  console.log('exitCode:', res.exitCode, '| timedOut:', res.timedOut);
  console.log('--- stdout ---\n' + res.stdout);
  console.log('--- stderr ---\n' + res.stderr);

  await deleteRepoFiles(repoId);
  console.log('cleaned up.');
}
main().catch((e) => {
  console.error('SANDBOX VERIFY FAILED:', e);
  process.exit(1);
});
