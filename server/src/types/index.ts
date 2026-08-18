/**
 * Cross-cutting types for the RepoScribe server.
 *
 * NOTE: These are intentionally duplicated (not shared) with the client's
 * `lib/types.ts`. Keep the two in sync manually when the API contract changes.
 */

/** A single embeddable slice of a source file, with citation metadata. */
export interface CodeChunk {
  /** `${repoId}:${filepath}:${chunkIndex}` */
  id: string;
  text: string;
  repoId: string;
  filepath: string;
  language: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
}

/** Lifecycle states emitted during async repo ingestion. */
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
  /** Optional counters, e.g. for `uploading (n/total)`. */
  processed?: number;
  total?: number;
  message?: string;
  error?: string;
}

/** One entry in a repo's upload manifest. */
export interface ManifestEntry {
  filepath: string;
  s3Key: string;
  size: number;
  language: string;
}

/** `repos/{repoId}/manifest.json` — the indexed file tree for a repo. */
export interface RepoManifest {
  repoId: string;
  repoUrl: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  files: ManifestEntry[];
  /** Clerk user id of the ingester (present when auth is enabled). */
  ownerUserId?: string;
}

/** Payload enqueued to BullMQ to kick off ingestion. */
export interface IngestJobData {
  repoUrl: string;
  /** Clerk user id, so ingested data can be scoped to its owner. */
  userId?: string;
}

/** Result returned by a completed ingestion job. */
export interface IngestJobResult {
  repoId: string;
  chunkCount: number;
  fileCount: number;
}

/** Result of running a command in the Docker sandbox. */
export interface SandboxResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/** A vector-search hit: the matched chunk plus its similarity score. */
export interface SearchHit {
  chunk: CodeChunk;
  score: number;
}

/** One recorded agent tool invocation — the raw material for the UI trace panel. */
export interface ToolCall {
  tool: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

/** Final output of an agent run. */
export interface AgentResult {
  answer: string;
  /** Ordered list of tools the agent invoked, with inputs/outputs/latency. */
  trace: ToolCall[];
  /** `filepath:startLine-endLine` references backing the answer. */
  citations: string[];
}

/**
 * A persisted repo entry in a user's registry — the minimum needed to list
 * previously-indexed repos and re-open one without re-ingesting.
 */
export interface UserRepoEntry {
  repoId: string;
  repoUrl: string;
  /** `owner/repo`, derived from the URL for display. */
  name: string;
  /** ISO timestamp the repo finished indexing. */
  indexedAt: string;
  fileCount: number;
  chunkCount: number;
}

/** One persisted chat turn (a user message and the assistant's reply). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** `filepath:startLine-endLine` references (assistant turns only). */
  citations?: string[];
  /** ISO timestamp the turn was recorded. */
  at: string;
}

/** Standard shape for the health-check endpoint. */
export interface HealthResponse {
  status: 'ok';
  service: 'reposcribe-server';
  timestamp: string;
  uptimeSeconds: number;
}
