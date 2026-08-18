import { Router, Request, Response } from 'express';
import { metrics } from '../services/metrics';

export const metricsRouter = Router();

/** GET /api/metrics — current counters + latency histograms. */
metricsRouter.get('/', (_req: Request, res: Response) => {
  res.json(metrics.snapshot());
});
