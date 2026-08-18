import { execFile } from 'child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

/**
 * Runs the `docker` CLI with the given args, capturing stdout/stderr and never
 * rejecting on a non-zero exit (that's meaningful output, e.g. lint failures).
 */
export function execDocker(args: string[], timeoutMs = 0): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      'docker',
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string; killed?: boolean; signal?: string }) | null;
        const timedOut = Boolean(e?.killed) || e?.signal === 'SIGTERM';
        const code = typeof e?.code === 'number' ? e.code : e ? 1 : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code, timedOut });
      },
    );
  });
}
