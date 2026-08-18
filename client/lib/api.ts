import type {
  HealthResponse,
  JobStatusResponse,
  RepoMeta,
  UserRepoEntry,
  ChatTurn,
} from './types';
import { authHeaders } from './auth';

/** Base URL of the RepoScribe server. Never hardcode a server URL elsewhere. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Parses a JSON error body's `error` field, falling back to a status message. */
async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    // keep default
  }
  return new ApiError(message, res.status);
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: 'no-store',
      headers: await authHeaders(),
    });
  } catch (err) {
    throw new ApiError(`Could not reach the server: ${(err as Error).message}`);
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health');
}

/** POST /api/repos — start ingestion, returns the job id. */
export async function createIngestJob(repoUrl: string): Promise<{ jobId: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/repos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ repoUrl }),
    });
  } catch (err) {
    throw new ApiError(`Could not reach the server: ${(err as Error).message}`);
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as { jobId: string };
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return getJson<JobStatusResponse>(`/api/repos/${encodeURIComponent(jobId)}/status`);
}

export async function getRepoMeta(repoId: string): Promise<RepoMeta> {
  return getJson<RepoMeta>(`/api/repos/${encodeURIComponent(repoId)}`);
}

/**
 * GET /api/repos — the signed-in user's previously-indexed repos (server-side
 * Redis registry). Empty for the anonymous user; the client falls back to its
 * localStorage list in that case.
 */
export async function listUserRepos(): Promise<UserRepoEntry[]> {
  const { repos } = await getJson<{ repos: UserRepoEntry[] }>('/api/repos');
  return repos;
}

/** DELETE /api/repos/:repoId/registry — forget a repo from the recent list. */
export async function forgetUserRepo(repoId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/repos/${encodeURIComponent(repoId)}/registry`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
  } catch {
    // Best-effort — the local cache removal is what the user sees.
  }
}

/** GET /api/chat/:repoId/history — the user's persisted turns for a repo. */
export async function getServerChatHistory(repoId: string): Promise<ChatTurn[]> {
  const { turns } = await getJson<{ turns: ChatTurn[] }>(
    `/api/chat/${encodeURIComponent(repoId)}/history`,
  );
  return turns;
}

/** DELETE /api/chat/:repoId/history — clear the user's turns for a repo. */
export async function clearServerChatHistory(repoId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/chat/${encodeURIComponent(repoId)}/history`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
  } catch {
    // Best-effort.
  }
}

/**
 * Fetches a file's raw contents through the API (server reads S3), avoiding a
 * cross-origin browser→S3 fetch and its CORS requirements.
 */
export async function fetchFileContent(repoId: string, filepath: string): Promise<string> {
  const encoded = filepath.split('/').map(encodeURIComponent).join('/');
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/repos/${encodeURIComponent(repoId)}/raw/${encoded}`, {
      cache: 'no-store',
      headers: await authHeaders(),
    });
  } catch (err) {
    throw new ApiError(`Could not reach the server: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ApiError(`Could not load file (${res.status})`, res.status);
  return res.text();
}
