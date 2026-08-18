import { Response } from 'express';

/** Sets the headers required for a Server-Sent Events stream. */
export function sseInit(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Disable proxy buffering so events flush immediately.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/** Writes one named SSE event with a JSON payload. */
export function sseSend(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
