/** Docker sandbox configuration + resource limits for untrusted code execution. */
export const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? 'reposcribe-sandbox:latest';
export const SANDBOX_MEMORY = process.env.SANDBOX_MEMORY ?? '256m';
export const SANDBOX_CPUS = process.env.SANDBOX_CPUS ?? '1';
export const SANDBOX_PIDS_LIMIT = process.env.SANDBOX_PIDS_LIMIT ?? '256';
export const SANDBOX_TIMEOUT_MS = parseInt(process.env.SANDBOX_TIMEOUT_MS ?? '15000', 10);
/** Cap files pulled into the workspace for a test run. */
export const SANDBOX_MAX_FILES = parseInt(process.env.SANDBOX_MAX_FILES ?? '500', 10);
