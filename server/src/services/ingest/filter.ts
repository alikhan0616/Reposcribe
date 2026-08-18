import { promises as fs } from 'fs';
import path from 'path';
import ignore, { Ignore } from 'ignore';
import { ALLOWED_EXTENSIONS } from './languages';
import { MAX_FILE_BYTES } from '../../config/ingest';

/**
 * gitignore-style patterns for things we never index, regardless of extension:
 * dependency dirs, build output, VCS internals, lockfiles, minified/bundled assets.
 */
export const IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  'out/',
  'coverage/',
  '.turbo/',
  '.cache/',
  'vendor/',
  '__pycache__/',
  '.venv/',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.lock',
  '*.min.js',
  '*.min.css',
  '*.map',
];

export function createIgnore(): Ignore {
  return ignore().add(IGNORE_PATTERNS);
}

/** Normalizes an OS-specific relative path to posix for `ignore` matching. */
function toPosix(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

/**
 * Pure predicate: is a repo-relative file path something we should ingest?
 * True only when it's not ignored AND has an allow-listed extension.
 */
export function isAllowedFile(relPath: string, ig: Ignore = createIgnore()): boolean {
  const posix = toPosix(relPath);
  if (!posix || posix.startsWith('/')) return false;
  if (ig.ignores(posix)) return false;
  const ext = path.extname(posix).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

export interface FilteredFile {
  absPath: string;
  /** Repo-relative, posix-separated path. */
  relPath: string;
  size: number;
}

/**
 * Recursively walks `root`, pruning ignored directories, and returns the files
 * that pass filtering and the per-file size cap.
 */
export async function walkRepo(root: string): Promise<FilteredFile[]> {
  const ig = createIgnore();
  const results: FilteredFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = toPosix(path.relative(root, abs));
      if (!rel) continue;

      if (entry.isDirectory()) {
        if (ig.ignores(`${rel}/`)) continue; // prune whole subtree
        await walk(abs);
      } else if (entry.isFile()) {
        if (ig.ignores(rel)) continue;
        const ext = path.extname(rel).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;
        const stat = await fs.stat(abs);
        if (stat.size > MAX_FILE_BYTES) continue;
        results.push({ absPath: abs, relPath: rel, size: stat.size });
      }
    }
  }

  await walk(root);
  return results;
}
