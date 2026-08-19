'use client';

/**
 * Branded full-screen overlay shown while the backend cold-starts. Purely
 * presentational — `progress` (0–100) and `message` are supplied by
 * `useBackendWake`, so it's trivial to render in isolation and in tests.
 */
export function BackendWakeScreen({
  progress,
  message,
}: {
  progress: number;
  message: string;
}) {
  const pct = Math.round(progress);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-10 px-6 text-center">
      <div>
        <h1 className="text-5xl font-bold tracking-tight">RepoScribe</h1>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Agentic RAG codebase assistant
        </p>
      </div>

      <div className="w-full">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Waking the backend up"
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p
          className="mt-4 text-sm text-gray-600 dark:text-gray-300"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      </div>

      <p className="max-w-xs text-xs text-gray-400 dark:text-gray-500">
        The backend sleeps on the free tier after 15 minutes idle. The first load
        can take up to a minute while it spins back up.
      </p>
    </main>
  );
}
