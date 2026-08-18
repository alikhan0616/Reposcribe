import type { ManifestEntry, RepoManifest } from '../../types';

/** Assembles a deterministic (filepath-sorted) manifest from upload entries. */
export function buildManifest(
  repoId: string,
  repoUrl: string,
  entries: ManifestEntry[],
  ownerUserId?: string,
): RepoManifest {
  const files = [...entries].sort((a, b) => a.filepath.localeCompare(b.filepath));
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  return {
    repoId,
    repoUrl,
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes,
    files,
    ...(ownerUserId ? { ownerUserId } : {}),
  };
}
