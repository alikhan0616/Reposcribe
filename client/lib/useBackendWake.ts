'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchHealth } from './api';

/** Tunables for the cold-start wake-up flow. */
const PING_TIMEOUT_MS = 6000; // abort a hung ping so we can retry
const RETRY_DELAY_MS = 2000; // wait between failed pings
const GRACE_MS = 600; // don't show the overlay if health resolves this fast
const TICK_MS = 150; // progress / message refresh cadence
const TAU_MS = 15000; // progress easing time-constant
const PROGRESS_CAP = 95; // progress ceiling until the server actually responds

export interface BackendWakeState {
  /** Server responded OK — reveal the app. */
  ready: boolean;
  /** The grace window elapsed without a response — safe to show the overlay. */
  pastGrace: boolean;
  /** 0–100, eased; snaps to 100 once ready. */
  progress: number;
  /** Reassurance message for the current elapsed time. */
  message: string;
}

/** Time-ordered reassurance copy; the last entry is the fallback. */
const MESSAGES: { until: number; text: string }[] = [
  { until: 6000, text: 'Waking the backend up…' },
  { until: 15000, text: 'Still warming up — hang tight…' },
  { until: 30000, text: 'Almost there, thanks for your patience…' },
  { until: 60000, text: 'Free-tier servers nap after 15 min of inactivity…' },
  { until: Infinity, text: 'This is taking a little longer than usual…' },
];

function messageFor(elapsedMs: number): string {
  return (MESSAGES.find((m) => elapsedMs < m.until) ?? MESSAGES[MESSAGES.length - 1]).text;
}

/** Eased progress that approaches PROGRESS_CAP but never reaches 100 until ready. */
function progressFor(elapsedMs: number): number {
  return Math.min(PROGRESS_CAP, PROGRESS_CAP * (1 - Math.exp(-elapsedMs / TAU_MS)));
}

/** jsdom (test env) and older browsers may lack `AbortSignal.timeout` — guard it. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

/**
 * Polls the public `/api/health` endpoint until the (possibly cold-starting)
 * server responds, exposing progress + a rotating message for a wake-up screen.
 * Retries indefinitely; a warm server resolves within the grace window so the
 * overlay never shows (`pastGrace` stays false). `/api/health` is unauthenticated
 * and sits before the server's rate limiter, so pinging it is cheap and free of
 * token requirements.
 */
export function useBackendWake(): BackendWakeState {
  const [state, setState] = useState<BackendWakeState>({
    ready: false,
    pastGrace: false,
    progress: 0,
    message: MESSAGES[0].text,
  });

  // Refs so the ticker sees live values without re-subscribing the effect.
  const startRef = useRef(0);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    startRef.current = Date.now();

    // Drive progress + message while we wait; goes quiet once ready.
    const interval = setInterval(() => {
      if (cancelled || readyRef.current) return;
      const elapsed = Date.now() - startRef.current;
      setState((s) => ({
        ...s,
        pastGrace: s.pastGrace || elapsed >= GRACE_MS,
        progress: progressFor(elapsed),
        message: messageFor(elapsed),
      }));
    }, TICK_MS);

    const attempt = async () => {
      if (cancelled) return;
      try {
        await fetchHealth(timeoutSignal(PING_TIMEOUT_MS));
        if (cancelled) return;
        readyRef.current = true;
        clearInterval(interval);
        setState((s) => ({ ...s, ready: true, progress: 100 }));
      } catch {
        // Cold start: 502/503, connection refused, or aborted ping — retry.
        if (cancelled) return;
        retryTimer = setTimeout(attempt, RETRY_DELAY_MS);
      }
    };
    void attempt();

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return state;
}
