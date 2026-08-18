import { runIngestPipeline, RepoTooLargeError } from '../../src/services/ingest/pipeline';
import type { IngestDeps } from '../../src/services/ingest/pipeline';
import type { FilteredFile } from '../../src/services/ingest/filter';
import type { IngestProgress } from '../../src/types';

/** Builds a set of mocked deps over an in-memory virtual repo. */
function makeDeps(virtualFiles: Record<string, string>) {
  const files: FilteredFile[] = Object.entries(virtualFiles).map(([relPath, content]) => ({
    absPath: `/tmp/clone/${relPath}`,
    relPath,
    size: Buffer.byteLength(content),
  }));

  const uploadedKeys: string[] = [];
  const cleanup = jest.fn(async () => undefined);
  const uploadManifest = jest.fn(async () => undefined);

  const deps: Partial<IngestDeps> = {
    clone: jest.fn(async (_url: string, repoId = 'fixed-repo-id') => ({
      repoId,
      dir: '/tmp/clone',
    })),
    cleanup,
    walk: jest.fn(async () => files),
    readFile: jest.fn(async (abs: string) => {
      const rel = abs.replace('/tmp/clone/', '');
      return virtualFiles[rel];
    }),
    uploadRawFile: jest.fn(async (repoId: string, filepath: string) => {
      const key = `repos/${repoId}/raw/${filepath}`;
      uploadedKeys.push(key);
      return key;
    }),
    uploadManifest,
    indexChunks: jest.fn(async (chunks: unknown[]) => (chunks as unknown[]).length),
  };

  return { deps, uploadedKeys, cleanup, uploadManifest };
}

describe('runIngestPipeline', () => {
  it('runs clone → upload → manifest → chunk end-to-end', async () => {
    const { deps, uploadedKeys, uploadManifest, cleanup } = makeDeps({
      'src/a.ts': 'export const a = 1;\nexport const b = 2;\n',
      'README.md': '# Title\n\nSome docs.\n',
    });

    const progress: IngestProgress[] = [];
    const result = await runIngestPipeline('https://github.com/acme/repo', {
      repoId: 'fixed-repo-id',
      deps,
      onProgress: (p) => progress.push(p),
    });

    expect(result.repoId).toBe('fixed-repo-id');
    expect(result.manifest.fileCount).toBe(2);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);

    // Every chunk carries the required citation metadata.
    for (const c of result.chunks) {
      expect(c.repoId).toBe('fixed-repo-id');
      expect(c.id.startsWith('fixed-repo-id:')).toBe(true);
      expect(c.startLine).toBeGreaterThanOrEqual(1);
    }

    // Uploaded under the correct S3 key structure.
    expect(uploadedKeys).toContain('repos/fixed-repo-id/raw/src/a.ts');
    expect(uploadManifest).toHaveBeenCalledTimes(1);

    // Manifest is filepath-sorted.
    expect(result.manifest.files.map((f) => f.filepath)).toEqual(['README.md', 'src/a.ts']);

    // Progress covers the expected lifecycle and ends with done.
    const statuses = progress.map((p) => p.status);
    expect(statuses).toContain('cloning');
    expect(statuses).toContain('uploading');
    expect(statuses).toContain('chunking');
    expect(statuses).toContain('embedding');
    expect(statuses[statuses.length - 1]).toBe('done');

    // Chunks were handed to the indexer.
    expect(deps.indexChunks).toHaveBeenCalledTimes(1);

    // Temp clone always cleaned up.
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cleans up the temp clone even when a later step throws', async () => {
    const { deps, cleanup } = makeDeps({ 'src/a.ts': 'const a = 1;' });
    (deps.uploadRawFile as jest.Mock).mockRejectedValueOnce(new Error('S3 down'));

    await expect(
      runIngestPipeline('https://github.com/acme/repo', { deps, repoId: 'r' }),
    ).rejects.toThrow('S3 down');

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('rejects repos that exceed the file-count cap', async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 2500; i++) many[`f${i}.ts`] = 'x';
    const { deps, cleanup } = makeDeps(many);

    await expect(
      runIngestPipeline('https://github.com/acme/repo', { deps, repoId: 'r' }),
    ).rejects.toBeInstanceOf(RepoTooLargeError);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
