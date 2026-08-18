'use client';

import { useCallback, useEffect, useState } from 'react';
import { listUserRepos, forgetUserRepo } from './api';
import {
  getRecentRepos,
  mergeRecentRepos,
  removeRecentRepo,
  addRecentRepo,
} from './recentRepos';
import { clearCachedTurns } from './chatHistory';
import { authEnabled } from './auth';
import { useUserId } from './userContext';
import type { UserRepoEntry } from './types';

/**
 * Surfaces the user's previously-indexed repos so they can jump back in without
 * re-ingesting. Seeds instantly from the localStorage cache, then (when auth is
 * on) reconciles with the server's Redis registry. When auth is off, the local
 * cache is the whole story.
 */
export function useRecentRepos() {
  const userId = useUserId();
  const [repos, setRepos] = useState<UserRepoEntry[]>([]);

  useEffect(() => {
    // Instant paint from cache.
    setRepos(getRecentRepos(userId));
    if (!authEnabled) return;

    let cancelled = false;
    listUserRepos()
      .then((server) => {
        if (cancelled) return;
        setRepos(mergeRecentRepos(userId, server));
      })
      .catch(() => {
        // Offline / server down — keep showing the cached list.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Records a freshly-indexed repo locally (server already has it via the worker). */
  const remember = useCallback(
    (entry: UserRepoEntry) => setRepos(addRecentRepo(userId, entry)),
    [userId],
  );

  /** Removes a repo from the recent list (registry + cached chat), local + server. */
  const forget = useCallback(
    (repoId: string) => {
      setRepos(removeRecentRepo(userId, repoId));
      clearCachedTurns(userId, repoId);
      if (authEnabled) void forgetUserRepo(repoId);
    },
    [userId],
  );

  return { repos, remember, forget };
}
