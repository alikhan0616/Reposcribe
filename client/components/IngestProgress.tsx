'use client';

import type { IngestState } from '@/lib/useIngest';
import type { IngestStatus } from '@/lib/types';

const STEP_LABELS: Record<IngestStatus, string> = {
  queued: 'Queued',
  cloning: 'Cloning repository',
  uploading: 'Uploading files',
  chunking: 'Chunking code',
  embedding: 'Embedding & indexing',
  done: 'Done',
  error: 'Error',
};

const STEP_ORDER: IngestStatus[] = ['cloning', 'uploading', 'chunking', 'embedding', 'done'];

/** Live ingestion progress with distinct, ordered states. */
export function IngestProgress({ state }: { state: IngestState }) {
  if (state.phase === 'error') {
    return (
      <div role="alert" className="rounded-lg border border-red-400 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
        <strong>Ingestion failed.</strong> {state.error}
      </div>
    );
  }

  const current: IngestStatus =
    state.phase === 'done' ? 'done' : state.progress?.status ?? 'queued';
  const currentIndex = STEP_ORDER.indexOf(current);
  const label = STEP_LABELS[current] ?? 'Working';
  const counter =
    state.progress?.total != null
      ? ` (${state.progress.processed ?? 0}/${state.progress.total})`
      : '';

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-medium">
        {state.phase !== 'done' && (
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
            aria-hidden
          />
        )}
        <span>
          {label}
          {counter}
        </span>
      </div>
      <ol className="flex flex-wrap gap-2">
        {STEP_ORDER.map((step, i) => {
          const done = currentIndex > i || current === 'done';
          const active = current === step && current !== 'done';
          return (
            <li
              key={step}
              className={[
                'rounded-full px-3 py-1 text-xs',
                done
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  : active
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
              ].join(' ')}
            >
              {STEP_LABELS[step]}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
