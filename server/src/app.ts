import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { reposRouter } from './routes/repos';
import { chatRouter } from './routes/chat';
import { metricsRouter } from './routes/metrics';
import { attachAuth } from './middleware/auth';
import { globalLimiter } from './middleware/rateLimit';

/**
 * Builds the Express application. Kept separate from `index.ts` (which owns
 * `listen`) so tests can import the app and drive it with supertest without
 * binding a port.
 */
export function createApp(): Application {
  const app = express();

  // In production we sit behind a host proxy (Render/Railway/Vercel), so the
  // real client IP is in X-Forwarded-For. Tell Express how many proxies to
  // trust so rate limiting keys off the client, not the proxy. A NUMBER, never
  // `true` (which express-rate-limit rejects as IP-spoofable).
  app.set('trust proxy', env.rateLimit.trustProxy);

  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Clerk auth (no-op unless CLERK_SECRET_KEY is set).
  attachAuth(app);

  // Health is mounted before the global limiter so liveness/readiness probes
  // (which hosts hit frequently) never burn the rate-limit budget.
  app.use('/api/health', healthRouter);

  // Broad safety-net limiter for the rest of the API (per-route limiters below
  // add tighter caps on the expensive endpoints).
  app.use('/api', globalLimiter);

  app.use('/api/repos', reposRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/metrics', metricsRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralized error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
