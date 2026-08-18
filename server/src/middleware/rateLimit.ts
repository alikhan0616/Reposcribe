import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { authEnabled } from './auth';

/**
 * Builds a rate limiter keyed per authenticated user, falling back to client
 * IP for anonymous traffic. Keying by user id (when Clerk auth is on) means a
 * shared office/NAT IP — or the single "anonymous" user in no-auth mode —
 * doesn't lump everyone into one bucket and block them together; each account
 * gets its own quota.
 *
 * When rate limiting is disabled (the default under tests, via
 * `env.rateLimit.enabled`), this returns a pass-through so route behavior and
 * the test suite stay deterministic and order-independent.
 */
export function createRateLimiter(options: { max: number; message: string }): RequestHandler {
  if (!env.rateLimit.enabled) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs: env.rateLimit.windowMs,
    limit: options.max,
    standardHeaders: true, // emit RateLimit-* headers so clients can see their quota
    legacyHeaders: false,
    // Per-user when authenticated; per-IP otherwise. `req.userId` is set by
    // `requireUser`, which runs before the per-route limiters. The global
    // limiter runs before auth, so it naturally falls back to IP — which is
    // the right granularity for a broad safety net anyway.
    keyGenerator: (req) =>
      authEnabled && req.userId && req.userId !== 'anonymous'
        ? req.userId
        : (req.ip ?? 'unknown'),
    message: { error: options.message },
  });
}

/** Ingestion is heavy (clone + embed an entire repo). Keep it low. */
export const ingestLimiter = createRateLimiter({
  max: env.rateLimit.ingestMax,
  message: 'Too many ingestion requests, please try again later.',
});

/** Every chat message drives several LLM calls, which cost money/quota. */
export const chatLimiter = createRateLimiter({
  max: env.rateLimit.chatMax,
  message: 'Too many messages, slow down a moment.',
});

/** Broad safety net across the whole API surface (per-IP). */
export const globalLimiter = createRateLimiter({
  max: env.rateLimit.globalMax,
  message: 'Too many requests, please try again later.',
});
