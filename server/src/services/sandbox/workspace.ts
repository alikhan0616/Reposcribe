import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import pLimit from 'p-limit';
import { getRawFile, getManifest } from '../ingest/s3';
import { SANDBOX_MAX_FILES } from '../../config/sandbox';

export interface WorkspaceDeps {
  getRawFile: typeof getRawFile;
  getManifest: typeof getManifest;
}

const defaultDeps: WorkspaceDeps = { getRawFile, getManifest };

/** Downloads the given repo files from S3 into a fresh temp workspace dir. */
export async function prepareWorkspace(
  repoId: string,
  filepaths: string[],
  deps: WorkspaceDeps = defaultDeps,
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reposcribe-sbx-'));
  const limit = pLimit(10);
  await Promise.all(
    filepaths.map((fp) =>
      limit(async () => {
        const content = await deps.getRawFile(repoId, fp);
        const abs = path.join(dir, fp);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content);
      }),
    ),
  );
  return dir;
}

/** Lists repo files (capped) for a full-repo test run. */
export async function listRepoFiles(
  repoId: string,
  deps: WorkspaceDeps = defaultDeps,
): Promise<string[]> {
  const manifest = await deps.getManifest(repoId);
  return manifest.files.map((f) => f.filepath).slice(0, SANDBOX_MAX_FILES);
}

export async function cleanupWorkspace(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/** Converts a host path to a form Docker's `-v` accepts (Windows → forward slashes). */
export function toDockerMountPath(p: string): string {
  return process.platform === 'win32' ? p.replace(/\\/g, '/') : p;
}
