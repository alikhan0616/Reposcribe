'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useIngest } from '@/lib/useIngest';
import { useRecentRepos } from '@/lib/useRecentRepos';
import { IngestProgress } from './IngestProgress';
import { RecentRepos } from './RecentRepos';

/** Derives an `owner/repo` display name from a GitHub URL (falls back to the URL). */
function repoNameFromUrl(repoUrl: string): string {
  try {
    const parts = new URL(repoUrl).pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1].replace(/\.git$/, '')}`;
  } catch {
    // fall through
  }
  return repoUrl;
}

/** Landing screen: submit a GitHub URL and watch it get ingested. */
export function RepoIntake({ onIngested }: { onIngested: (repoId: string) => void }) {
  const { state, submit } = useIngest();
  const { repos, remember, forget } = useRecentRepos();
  const [url, setUrl] = useState('');

  const busy = state.phase === 'submitting' || state.phase === 'polling';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim() && !busy) void submit(url.trim());
  };

  // Record + transition once ingestion completes. Done in an effect so the
  // recent-repos cache is updated exactly once (not on every render).
  useEffect(() => {
    if (state.phase === 'done' && state.repoId && state.repoUrl && state.result) {
      remember({
        repoId: state.repoId,
        repoUrl: state.repoUrl,
        name: repoNameFromUrl(state.repoUrl),
        indexedAt: new Date().toISOString(),
        fileCount: state.result.fileCount,
        chunkCount: state.result.chunkCount,
      });
      onIngested(state.repoId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.repoId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">RepoScribe</h1>
        <p className="mt-3 text-gray-600 dark:text-gray-400">
          Paste a public GitHub repo URL. RepoScribe indexes it, then an agent answers
          questions about the code — searching, reading, and citing it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          disabled={busy}
          aria-label="GitHub repository URL"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Ingesting…' : 'Ingest'}
        </button>
      </form>

      {state.phase !== 'idle' && (
        <div className="w-full">
          <IngestProgress state={state} />
        </div>
      )}

      {!busy && <RecentRepos repos={repos} onOpen={onIngested} onForget={forget} />}
    </main>
  );
}
