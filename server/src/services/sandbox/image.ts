import path from 'path';
import { execDocker } from './exec';
import { SANDBOX_IMAGE } from '../../config/sandbox';

/** Build context: server/sandbox (holds the Dockerfile, config, lint script). */
const SANDBOX_DIR = path.resolve(__dirname, '../../../sandbox');

let ensured = false;

/** Builds the sandbox image on first use if it isn't already present. */
export async function ensureSandboxImage(): Promise<void> {
  if (ensured) return;

  const inspect = await execDocker(['image', 'inspect', SANDBOX_IMAGE]);
  if (inspect.code === 0) {
    ensured = true;
    return;
  }

  const build = await execDocker(['build', '-t', SANDBOX_IMAGE, SANDBOX_DIR], 600_000);
  if (build.code !== 0) {
    throw new Error(`Failed to build sandbox image: ${build.stderr.slice(0, 400)}`);
  }
  ensured = true;
}
