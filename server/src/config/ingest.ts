/** Ingestion pipeline tuning constants. Chunk params are fixed by convention. */
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

/** Max concurrent S3 uploads. */
export const UPLOAD_CONCURRENCY = 10;

/** Guardrails so an oversized repo can't choke the queue. */
export const MAX_FILES = 2000;
export const MAX_FILE_BYTES = 1_000_000; // 1 MB per file
export const MAX_TOTAL_BYTES = 50_000_000; // 50 MB across all kept files

/** Repo-size cap (KB) checked against the GitHub API before enqueuing ingestion. */
export const MAX_REPO_KB = 50_000; // ~50 MB checkout
