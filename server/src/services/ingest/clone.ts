import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';

export interface CloneResult {
  repoId: string;
  dir: string;
}

/** Basic GitHub URL validation before we attempt a clone. */
export function isValidGitHubUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return false;
  const parts = u.pathname.split('/').filter(Boolean);
  return parts.length >= 2;
}

/** Shallow-clones a repo into a fresh temp dir. Caller must `cleanupClone`. */
export async function cloneRepo(repoUrl: string, repoId: string = uuidv4()): Promise<CloneResult> {
  const dir = path.join(os.tmpdir(), `reposcribe-${repoId}`);
  await fs.mkdir(dir, { recursive: true });
  await simpleGit().clone(repoUrl, dir, ['--depth', '1', '--single-branch']);
  return { repoId, dir };
}

/** Removes the temp clone. Safe to call on a missing path. */
export async function cleanupClone(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
