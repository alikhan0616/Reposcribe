'use client';

import type { UserRepoEntry } from '@/lib/types';

/**
 * Lists the user's previously-indexed repos beneath the intake form so they can
 * re-open one in a single click — no re-ingestion. Rendered only when there's
 * at least one remembered repo.
 */
export function RecentRepos({
  repos,
  onOpen,
  onForget,
}: {
  repos: UserRepoEntry[];
  onOpen: (repoId: string) => void;
  onForget: (repoId: string) => void;
}) {
  if (repos.length === 0) return null;

  return (
    <section className="w-full" aria-label="Recent repositories">
      <h2 className="mb-2 text-sm font-semibold text-gray-500">Jump back in</h2>
      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {repos.map((r) => (
          <li key={r.repoId} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={() => onOpen(r.repoId)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate font-mono text-sm">{r.name}</div>
              <div className="text-xs text-gray-400">
                {r.fileCount} files · {r.chunkCount} chunks · indexed{' '}
                {new Date(r.indexedAt).toLocaleDateString()}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onForget(r.repoId)}
              aria-label={`Forget ${r.name}`}
              className="shrink-0 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
