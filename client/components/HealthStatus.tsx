'use client';

import { useEffect, useState } from 'react';
import { fetchHealth, API_URL } from '@/lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; uptimeSeconds: number }
  | { kind: 'error'; message: string };

/**
 * Small connectivity indicator proving the client can reach the server
 * across CORS. Placeholder for Phase 1 — replaced by the repo intake flow later.
 */
export function HealthStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((h) => {
        if (!cancelled) setState({ kind: 'ok', uptimeSeconds: h.uptimeSeconds });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dot =
    state.kind === 'ok'
      ? 'bg-green-500'
      : state.kind === 'error'
        ? 'bg-red-500'
        : 'bg-yellow-500 animate-pulse';

  return (
    <div
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
      {state.kind === 'loading' && <span>Connecting to server…</span>}
      {state.kind === 'ok' && (
        <span>
          Server connected · uptime {state.uptimeSeconds}s
        </span>
      )}
      {state.kind === 'error' && (
        <span className="text-red-600 dark:text-red-400">
          Server unreachable — {state.message}
        </span>
      )}
      <span className="text-gray-400">({API_URL})</span>
    </div>
  );
}
