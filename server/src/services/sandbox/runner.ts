import { randomUUID } from 'crypto';
import { execDocker, ExecResult } from './exec';
import { ensureSandboxImage } from './image';
import {
  prepareWorkspace,
  listRepoFiles,
  cleanupWorkspace,
  toDockerMountPath,
} from './workspace';
import {
  SANDBOX_IMAGE,
  SANDBOX_MEMORY,
  SANDBOX_CPUS,
  SANDBOX_PIDS_LIMIT,
  SANDBOX_TIMEOUT_MS,
} from '../../config/sandbox';
import type { SandboxResult } from '../../types';

/** Injectable side-effects so runners can be tested without Docker/S3/fs. */
export interface SandboxDeps {
  ensureImage: () => Promise<void>;
  prepare: (repoId: string, filepaths: string[]) => Promise<string>;
  listFiles: (repoId: string) => Promise<string[]>;
  cleanup: (dir: string) => Promise<void>;
  exec: (args: string[], timeoutMs?: number) => Promise<ExecResult>;
}

const defaultDeps: SandboxDeps = {
  ensureImage: ensureSandboxImage,
  prepare: prepareWorkspace,
  listFiles: listRepoFiles,
  cleanup: cleanupWorkspace,
  exec: execDocker,
};

/** Assembles the hardened `docker run` argv: no network, capped mem/cpu/pids, read-only mount. */
export function buildRunArgs(hostDir: string, name: string, command: string[]): string[] {
  return [
    'run',
    '--rm',
    '--name',
    name,
    '--network',
    'none',
    '--memory',
    SANDBOX_MEMORY,
    '--cpus',
    SANDBOX_CPUS,
    '--pids-limit',
    SANDBOX_PIDS_LIMIT,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '-v',
    `${toDockerMountPath(hostDir)}:/workspace:ro`,
    '-w',
    '/workspace',
    SANDBOX_IMAGE,
    ...command,
  ];
}

async function runInContainer(
  hostDir: string,
  command: string[],
  deps: SandboxDeps,
): Promise<SandboxResult> {
  const name = `reposcribe-sbx-${randomUUID().slice(0, 8)}`;
  const res = await deps.exec(buildRunArgs(hostDir, name, command), SANDBOX_TIMEOUT_MS);
  if (res.timedOut) {
    // Ensure a hung container is force-removed.
    await deps.exec(['rm', '-f', name]).catch(() => undefined);
  }
  return {
    command: command.join(' '),
    stdout: res.stdout,
    stderr: res.stderr,
    exitCode: res.code,
    timedOut: res.timedOut,
  };
}

/** Runs the sandbox linter against a single repo file. */
export async function runLinter(
  repoId: string,
  filepath: string,
  deps: SandboxDeps = defaultDeps,
): Promise<SandboxResult> {
  await deps.ensureImage();
  const dir = await deps.prepare(repoId, [filepath]);
  try {
    return await runInContainer(dir, ['sh', '/sandbox/lint.sh', filepath], deps);
  } finally {
    await deps.cleanup(dir);
  }
}

/**
 * Runs a test command against the repo's files in the sandbox. Note: repo
 * dependencies (node_modules) aren't available offline, so this works for
 * dependency-free tests; otherwise it returns the failing output for the agent.
 */
export async function runTests(
  repoId: string,
  testCommand = 'node --test',
  deps: SandboxDeps = defaultDeps,
): Promise<SandboxResult> {
  await deps.ensureImage();
  const files = await deps.listFiles(repoId);
  const dir = await deps.prepare(repoId, files);
  try {
    return await runInContainer(dir, ['sh', '-c', testCommand], deps);
  } finally {
    await deps.cleanup(dir);
  }
}
