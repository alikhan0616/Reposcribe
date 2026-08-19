'use client';

import { useBackendWake } from '@/lib/useBackendWake';
import { BackendWakeScreen } from './BackendWakeScreen';

/**
 * Gates the app behind a backend liveness check. On Render's free tier the server
 * spins down after ~15 min idle and the next request cold-starts it (~30–60s), so
 * until `/api/health` responds we show a branded wake-up screen. A warm or local
 * backend resolves within the grace window, so nothing is shown in that case.
 *
 * Sits outside `AuthGate` so it shows first and warms the backend in parallel with
 * Clerk loading; the health ping is unauthenticated, so no token is needed here.
 */
export function BackendGate({ children }: { children: React.ReactNode }) {
  const { ready, pastGrace, progress, message } = useBackendWake();

  if (ready) return <>{children}</>;
  if (pastGrace) return <BackendWakeScreen progress={progress} message={message} />;
  return null;
}
