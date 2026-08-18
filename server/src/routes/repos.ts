import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getIngestQueue } from '../workers/queue';
import { isValidGitHubUrl } from '../services/ingest/clone';
import { getManifest, getRawFile, presignRawFile } from '../services/ingest/s3';
import { parseGitHubRepo, getRepoInfo } from '../services/agent/tools/github';
import { countRepoChunks } from '../services/embeddings/qdrant';
import { MAX_REPO_KB } from '../config/ingest';
import { requireUser, getUserId, enforceOwnership, authEnabled } from '../middleware/auth';
import { listUserRepos, removeUserRepo } from '../services/history';

export const reposRouter = Router();

// All repo routes require an authenticated user (anonymous when auth is off).
reposRouter.use(requireUser);

/**
 * GET /api/repos — the signed-in user's previously-indexed repos, newest first,
 * so they can re-open one without re-ingesting. Empty for the anonymous user
 * (no server-side persistence — the client keeps a localStorage list instead).
 */
reposRouter.get('/', async (req: Request, res: Response) => {
  try {
    const repos = await listUserRepos(getUserId(req));
    return res.json({ repos });
  } catch {
    // Registry is a convenience layer; never fail the whole screen over it.
    return res.json({ repos: [] });
  }
});

/** Cap ingestion requests to prevent abuse. */
const ingestLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many ingestion requests, please try again later.' },
});

/** POST /api/repos — validate + enqueue an ingestion job. */
reposRouter.post('/', ingestLimiter, async (req: Request, res: Response) => {
  const repoUrl = (req.body ?? {}).repoUrl;
  const repo = typeof repoUrl === 'string' ? parseGitHubRepo(repoUrl) : null;

  if (typeof repoUrl !== 'string' || !isValidGitHubUrl(repoUrl) || !repo) {
    return res.status(400).json({ error: 'A valid public GitHub repository URL is required.' });
  }

  let info;
  try {
    info = await getRepoInfo(repo);
  } catch (e) {
    return res.status(502).json({ error: `Could not reach GitHub: ${(e as Error).message}` });
  }
  if (!info) {
    return res.status(404).json({ error: 'Repository not found or is private.' });
  }
  if (info.private) {
    return res.status(403).json({ error: 'Private repositories are not supported.' });
  }
  if (info.sizeKb > MAX_REPO_KB) {
    return res
      .status(413)
      .json({ error: `Repository is too large (${info.sizeKb} KB > ${MAX_REPO_KB} KB limit).` });
  }

  const job = await getIngestQueue().add('ingest', { repoUrl, userId: getUserId(req) });
  return res.status(202).json({ jobId: String(job.id) });
});

/** GET /api/repos/:jobId/status — poll ingestion progress. */
reposRouter.get('/:jobId/status', async (req: Request, res: Response) => {
  const job = await getIngestQueue().getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  if (authEnabled && job.data.userId && job.data.userId !== getUserId(req)) {
    return res.status(403).json({ error: 'You do not have access to this job.' });
  }
  const state = await job.getState();
  return res.json({
    jobId: String(job.id),
    state,
    progress: job.progress ?? null,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
  });
});

/** GET /api/repos/:repoId — repo metadata (file/chunk counts, indexed at). */
reposRouter.get('/:repoId', async (req: Request, res: Response) => {
  let manifest;
  try {
    manifest = await getManifest(req.params.repoId);
  } catch {
    return res.status(404).json({ error: 'Repository not found or not yet ingested.' });
  }
  if (authEnabled && manifest.ownerUserId && manifest.ownerUserId !== getUserId(req)) {
    return res.status(403).json({ error: 'You do not have access to this repository.' });
  }

  let chunkCount = 0;
  try {
    chunkCount = await countRepoChunks(req.params.repoId);
  } catch {
    // Non-fatal — return metadata without the chunk count.
  }

  return res.json({
    repoId: manifest.repoId,
    repoUrl: manifest.repoUrl,
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    chunkCount,
    indexedAt: manifest.createdAt,
    files: manifest.files.map((f) => f.filepath),
  });
});

/**
 * DELETE /api/repos/:repoId/registry — forget a repo from the user's recent
 * list. Does NOT delete the indexed data (manifest/vectors) — just hides it
 * from the picker. No-op for the anonymous user.
 */
reposRouter.delete('/:repoId/registry', async (req: Request, res: Response) => {
  if (!(await enforceOwnership(req, res, req.params.repoId))) return;
  try {
    await removeUserRepo(getUserId(req), req.params.repoId);
    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: `Could not update registry: ${(e as Error).message}` });
  }
});

/**
 * GET /api/repos/:repoId/raw/* — raw file contents, proxied through the API
 * (server reads S3). Used by the file viewer, avoiding browser→S3 CORS.
 */
reposRouter.get('/:repoId/raw/*', async (req: Request, res: Response) => {
  const filepath = (req.params as unknown as Record<string, string>)[0];
  if (!filepath) {
    return res.status(400).json({ error: 'A filepath is required.' });
  }
  if (!(await enforceOwnership(req, res, req.params.repoId))) return;
  try {
    const content = await getRawFile(req.params.repoId, filepath);
    return res.type('text/plain; charset=utf-8').send(content);
  } catch {
    return res.status(404).json({ error: 'File not found.' });
  }
});

/** GET /api/repos/:repoId/files/* — presigned S3 URL for a raw file (download). */
reposRouter.get('/:repoId/files/*', async (req: Request, res: Response) => {
  const filepath = (req.params as unknown as Record<string, string>)[0];
  if (!filepath) {
    return res.status(400).json({ error: 'A filepath is required.' });
  }
  if (!(await enforceOwnership(req, res, req.params.repoId))) return;
  try {
    const url = await presignRawFile(req.params.repoId, filepath);
    return res.json({ url });
  } catch (e) {
    return res.status(500).json({ error: `Could not presign file: ${(e as Error).message}` });
  }
});
