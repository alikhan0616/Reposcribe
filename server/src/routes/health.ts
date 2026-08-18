import { Router, Request, Response } from 'express';
import type { HealthResponse } from '../types';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json({
    status: 'ok',
    service: 'reposcribe-server',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});
