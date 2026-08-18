import request from 'supertest';

// --- Mocks (no real Redis / S3 / Qdrant / GitHub) ---
const mockAdd = jest.fn(async () => ({ id: 'job-123' }));
const mockGetJob = jest.fn();
jest.mock('../../src/workers/queue', () => ({
  getIngestQueue: () => ({ add: mockAdd, getJob: mockGetJob }),
}));

jest.mock('../../src/services/agent/tools/github', () => ({
  ...jest.requireActual('../../src/services/agent/tools/github'),
  getRepoInfo: jest.fn(),
}));

jest.mock('../../src/services/ingest/s3', () => ({
  getManifest: jest.fn(),
  presignRawFile: jest.fn(),
}));

jest.mock('../../src/services/embeddings/qdrant', () => ({
  countRepoChunks: jest.fn(),
}));

jest.mock('../../src/services/history', () => ({
  listUserRepos: jest.fn(),
  removeUserRepo: jest.fn(),
}));

import { createApp } from '../../src/app';
import { getRepoInfo } from '../../src/services/agent/tools/github';
import { getManifest, presignRawFile } from '../../src/services/ingest/s3';
import { countRepoChunks } from '../../src/services/embeddings/qdrant';
import { listUserRepos, removeUserRepo } from '../../src/services/history';

const mockGetRepoInfo = getRepoInfo as jest.Mock;
const mockGetManifest = getManifest as jest.Mock;
const mockPresign = presignRawFile as jest.Mock;
const mockCount = countRepoChunks as jest.Mock;
const mockListUserRepos = listUserRepos as jest.Mock;
const mockRemoveUserRepo = removeUserRepo as jest.Mock;

const app = createApp();

describe('GET /api/repos (recent list)', () => {
  beforeEach(() => mockListUserRepos.mockReset());

  it("returns the user's repos", async () => {
    const repos = [
      { repoId: 'r1', repoUrl: 'https://github.com/acme/widget', name: 'acme/widget', indexedAt: '2026-01-01T00:00:00Z', fileCount: 3, chunkCount: 42 },
    ];
    mockListUserRepos.mockResolvedValueOnce(repos);
    const res = await request(app).get('/api/repos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repos });
  });

  it('degrades to an empty list when the registry errors', async () => {
    mockListUserRepos.mockRejectedValueOnce(new Error('redis down'));
    const res = await request(app).get('/api/repos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repos: [] });
  });
});

describe('DELETE /api/repos/:repoId/registry', () => {
  beforeEach(() => mockRemoveUserRepo.mockReset());

  it('forgets a repo and returns 204', async () => {
    mockRemoveUserRepo.mockResolvedValueOnce(undefined);
    const res = await request(app).delete('/api/repos/r1/registry');
    expect(res.status).toBe(204);
    expect(mockRemoveUserRepo).toHaveBeenCalledWith('anonymous', 'r1');
  });
});

describe('POST /api/repos', () => {
  beforeEach(() => {
    mockGetRepoInfo.mockReset();
    mockAdd.mockClear();
  });

  it('rejects an invalid repo URL with 400', async () => {
    const res = await request(app).post('/api/repos').send({ repoUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('returns 404 when the repo is not found', async () => {
    mockGetRepoInfo.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/repos')
      .send({ repoUrl: 'https://github.com/acme/ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a private repo', async () => {
    mockGetRepoInfo.mockResolvedValue({ private: true, sizeKb: 10, defaultBranch: 'main' });
    const res = await request(app)
      .post('/api/repos')
      .send({ repoUrl: 'https://github.com/acme/secret' });
    expect(res.status).toBe(403);
  });

  it('returns 413 for an oversized repo', async () => {
    mockGetRepoInfo.mockResolvedValue({ private: false, sizeKb: 999_999, defaultBranch: 'main' });
    const res = await request(app)
      .post('/api/repos')
      .send({ repoUrl: 'https://github.com/acme/huge' });
    expect(res.status).toBe(413);
  });

  it('enqueues a job and returns 202 + jobId for a valid repo', async () => {
    mockGetRepoInfo.mockResolvedValue({ private: false, sizeKb: 100, defaultBranch: 'main' });
    const res = await request(app)
      .post('/api/repos')
      .send({ repoUrl: 'https://github.com/acme/widget' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: 'job-123' });
    expect(mockAdd).toHaveBeenCalledWith(
      'ingest',
      expect.objectContaining({ repoUrl: 'https://github.com/acme/widget' }),
    );
  });
});

describe('GET /api/repos/:jobId/status', () => {
  it('returns 404 when the job does not exist', async () => {
    mockGetJob.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/repos/nope/status');
    expect(res.status).toBe(404);
  });

  it('returns job state + progress', async () => {
    mockGetJob.mockResolvedValueOnce({
      id: 'job-123',
      getState: async () => 'active',
      progress: { status: 'embedding', processed: 5, total: 10 },
      returnvalue: null,
      failedReason: null,
    });
    const res = await request(app).get('/api/repos/job-123/status');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('active');
    expect(res.body.progress).toEqual({ status: 'embedding', processed: 5, total: 10 });
  });
});

describe('GET /api/repos/:repoId', () => {
  it('returns 404 when the manifest is missing', async () => {
    mockGetManifest.mockRejectedValueOnce(new Error('NoSuchKey'));
    const res = await request(app).get('/api/repos/repo1');
    expect(res.status).toBe(404);
  });

  it('returns metadata with file + chunk counts', async () => {
    mockGetManifest.mockResolvedValueOnce({
      repoId: 'repo1',
      repoUrl: 'https://github.com/acme/widget',
      createdAt: '2026-01-01T00:00:00Z',
      fileCount: 3,
      totalBytes: 123,
      files: [{ filepath: 'a.ts' }, { filepath: 'b.ts' }, { filepath: 'c.md' }],
    });
    mockCount.mockResolvedValueOnce(42);
    const res = await request(app).get('/api/repos/repo1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ repoId: 'repo1', fileCount: 3, chunkCount: 42 });
    expect(res.body.files).toContain('a.ts');
  });
});

describe('GET /api/repos/:repoId/files/*', () => {
  it('returns a presigned URL for a nested filepath', async () => {
    mockPresign.mockResolvedValueOnce('https://s3.example/presigned');
    const res = await request(app).get('/api/repos/repo1/files/src/utils/helpers.ts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://s3.example/presigned' });
    expect(mockPresign).toHaveBeenCalledWith('repo1', 'src/utils/helpers.ts');
  });
});
