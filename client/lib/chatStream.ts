import { API_URL, ApiError } from './api';
import { authHeaders } from './auth';
import type { ToolCall } from './types';

export interface ChatStreamHandlers {
  onTrace?: (call: ToolCall) => void;
  onCitations?: (citations: string[]) => void;
  onToken?: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

/** Dispatches one parsed SSE event to the appropriate handler. */
function dispatch(event: string, data: string, h: ChatStreamHandlers): void {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }
  switch (event) {
    case 'trace':
      h.onTrace?.(payload as ToolCall);
      break;
    case 'citations':
      h.onCitations?.(payload as string[]);
      break;
    case 'token':
      h.onToken?.((payload as { text: string }).text);
      break;
    case 'error':
      h.onError?.((payload as { message: string }).message);
      break;
    case 'done':
      h.onDone?.();
      break;
  }
}

/**
 * POSTs to /api/chat and parses the SSE response stream, invoking handlers as
 * events arrive. Uses fetch + ReadableStream (EventSource can't POST a body).
 */
export async function streamChat(
  body: { repoId: string; message: string; history?: ChatHistoryItem[] },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ApiError(`Could not reach the server: ${(err as Error).message}`);
  }
  if (!res.ok || !res.body) {
    throw new ApiError(`Chat request failed (${res.status})`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // SSE frames are separated by a blank line.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let event = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length > 0) dispatch(event, dataLines.join('\n'), handlers);
    }
  }
}
