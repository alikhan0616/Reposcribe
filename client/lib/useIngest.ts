'use client';

import { useCallback, useRef, useState } from 'react';
import { createIngestJob, getJobStatus, ApiError } from './api';
import type { IngestProgress, IngestJobResult } from './types';

export type IngestPhase = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

export interface IngestState {
  phase: IngestPhase;
  progress?: IngestProgress;
  jobId?: string;
  repoId?: string;
  /** The submitted GitHub URL (available from `submitting` onward). */
  repoUrl?: string;
  /** Final counts, present in the `done` phase. */
  result?: IngestJobResult;
  error?: string;
}

const POLL_INTERVAL_MS = 1000;

/** Normalizes a BullMQ progress value (object or number) to IngestProgress. */
function toProgress(p: IngestProgress | number | null): IngestProgress | undefined {
  if (p && typeof p === 'object') return p;
  return undefined;
}

/** Manages the repo ingestion lifecycle: submit → poll status → done/error. */
export function useIngest() {
  const [state, setState] = useState<IngestState>({ phase: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback((jobId: string, repoUrl: string) => {
    const tick = async () => {
      try {
        const status = await getJobStatus(jobId);
        if (status.state === 'completed' && status.result) {
          setState({ phase: 'done', jobId, repoUrl, repoId: status.result.repoId, result: status.result });
          return;
        }
        if (status.state === 'failed') {
          setState({
            phase: 'error',
            jobId,
            repoUrl,
            error: status.failedReason ?? 'Ingestion failed.',
          });
          return;
        }
        setState({ phase: 'polling', jobId, repoUrl, progress: toProgress(status.progress) });
        timer.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        setState({ phase: 'error', jobId, repoUrl, error: (e as Error).message });
      }
    };
    void tick();
  }, []);

  const submit = useCallback(
    async (repoUrl: string) => {
      if (timer.current) clearTimeout(timer.current);
      setState({ phase: 'submitting', repoUrl });
      try {
        const { jobId } = await createIngestJob(repoUrl);
        setState({ phase: 'polling', jobId, repoUrl });
        poll(jobId, repoUrl);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        setState({ phase: 'error', repoUrl, error: msg });
      }
    },
    [poll],
  );

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setState({ phase: 'idle' });
  }, []);

  return { state, submit, reset };
}
