import { Request, Response, NextFunction, Application } from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { env } from '../config/env';
import { getManifest } from '../services/ingest/s3';

/** Auth is enforced only when a Clerk secret key is configured. */
export const authEnabled = Boolean(env.clerkSecretKey);

const ANONYMOUS = 'anonymous';

// Augment Express Request with the resolved user id.
declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

/** Mounts Clerk's middleware when auth is enabled (no-op otherwise). */
export function attachAuth(app: Application): void {
  if (authEnabled) app.use(clerkMiddleware());
}

/**
 * Resolves the request user. With Clerk enabled, rejects unauthenticated
 * requests (401); without Clerk, everyone is a single anonymous user.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled) {
    req.userId = ANONYMOUS;
    next();
    return;
  }
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  req.userId = userId;
  next();
}

export function getUserId(req: Request): string {
  return req.userId ?? ANONYMOUS;
}

export type OwnershipResult = 'ok' | 'notfound' | 'forbidden';

/**
 * Checks that `userId` owns `repoId` (via the manifest's ownerUserId). Only
 * meaningful when auth is enabled; callers should skip it otherwise.
 */
export async function checkRepoOwnership(
  repoId: string,
  userId: string,
): Promise<OwnershipResult> {
  let manifest;
  try {
    manifest = await getManifest(repoId);
  } catch {
    return 'notfound';
  }
  if (manifest.ownerUserId && manifest.ownerUserId !== userId) return 'forbidden';
  return 'ok';
}

/** Enforces ownership when auth is on; writes the response + returns false on failure. */
export async function enforceOwnership(
  req: Request,
  res: Response,
  repoId: string,
): Promise<boolean> {
  if (!authEnabled) return true;
  const result = await checkRepoOwnership(repoId, getUserId(req));
  if (result === 'notfound') {
    res.status(404).json({ error: 'Repository not found.' });
    return false;
  }
  if (result === 'forbidden') {
    res.status(403).json({ error: 'You do not have access to this repository.' });
    return false;
  }
  return true;
}
