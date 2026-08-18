/**
 * Client-side copy of the API contract types.
 *
 * NOTE: intentionally duplicated (not shared) with the server's
 * `src/types/index.ts`. Keep in sync manually when the API changes.
 */

export interface CodeChunk {
  id: string;
  text: string;
  repoId: string;
  filepath: string;
  language: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
}

export type IngestStatus =
  | 'queued'
  | 'cloning'
  | 'uploading'
  | 'chunking'
  | 'embedding'
  | 'done'
  | 'error';

export interface IngestProgress {
  status: IngestStatus;
  processed?: number;
  total?: number;
  message?: string;
  error?: string;
}

export interface HealthResponse {
  status: 'ok';
  service: 'reposcribe-server';
  timestamp: string;
  uptimeSeconds: number;
}

/** One recorded agent tool invocation — backing data for the trace panel. */
export interface ToolCall {
  tool: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export interface IngestJobResult {
  repoId: string;
  chunkCount: number;
  fileCount: number;
}

/** Response of GET /api/repos/:jobId/status. */
export interface JobStatusResponse {
  jobId: string;
  state: string;
  progress: IngestProgress | number | null;
  result: IngestJobResult | null;
  failedReason: string | null;
}

/** Response of GET /api/repos/:repoId. */
export interface RepoMeta {
  repoId: string;
  repoUrl: string;
  fileCount: number;
  totalBytes: number;
  chunkCount: number;
  indexedAt: string;
  files: string[];
}

/** A parsed `filepath:startLine-endLine` citation. */
export interface Citation {
  raw: string;
  filepath: string;
  startLine: number;
  endLine: number;
}

/** A single chat message in the UI. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trace: ToolCall[];
  citations: string[];
  streaming: boolean;
  error?: string;
}

/** A user's previously-indexed repo, for the recent-repos picker. */
export interface UserRepoEntry {
  repoId: string;
  repoUrl: string;
  name: string;
  indexedAt: string;
  fileCount: number;
  chunkCount: number;
}

/** One persisted chat turn (server-synced when auth is on). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  at: string;
}
