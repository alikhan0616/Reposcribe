import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { reposRouter } from './routes/repos';
import { chatRouter } from './routes/chat';
import { metricsRouter } from './routes/metrics';
import { attachAuth } from './middleware/auth';

/**
 * Builds the Express application. Kept separate from `index.ts` (which owns
 * `listen`) so tests can import the app and drive it with supertest without
 * binding a port.
 */
export function createApp(): Application {
  const app = express();

  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Clerk auth (no-op unless CLERK_SECRET_KEY is set).
  attachAuth(app);

  app.use('/api/health', healthRouter);
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
