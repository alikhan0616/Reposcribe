import { Router, Request, Response } from 'express';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { streamAgent } from '../services/agent/graph';
import { requireUser, getUserId, enforceOwnership } from '../middleware/auth';
import {
  getChatHistory,
  appendChatTurns,
  clearChatHistory,
} from '../services/history';
import { sseInit, sseSend } from './sse';
import type { ChatTurn } from '../types';

export const chatRouter = Router();

chatRouter.use(requireUser);

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

function toMessages(history: unknown): BaseMessage[] {
  if (!Array.isArray(history)) return [];
  return (history as ChatHistoryItem[])
    .filter((h) => h && typeof h.content === 'string')
    .map((h) => (h.role === 'assistant' ? new AIMessage(h.content) : new HumanMessage(h.content)));
}

/** Splits an answer into small chunks for a token-by-token streaming feel. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? (text ? [text] : []);
}

/**
 * POST /api/chat — streams the agent's response over SSE.
 * Events: `trace` (per tool call), `citations`, `token` (answer chunks),
 * `done`, and `error`.
 */
chatRouter.post('/', async (req: Request, res: Response) => {
  const { repoId, message, history } = req.body ?? {};
  if (typeof repoId !== 'string' || !repoId || typeof message !== 'string' || !message) {
    return res.status(400).json({ error: 'repoId and message are required.' });
  }
  if (!(await enforceOwnership(req, res, repoId))) return;

  sseInit(res);
  let answer = '';
  let citations: string[] = [];
  try {
    for await (const ev of streamAgent({ repoId, question: message, history: toMessages(history) })) {
      if (ev.type === 'trace') {
        sseSend(res, 'trace', ev.call);
      } else if (ev.type === 'citations') {
        citations = ev.citations;
        sseSend(res, 'citations', ev.citations);
      } else if (ev.type === 'answer') {
        answer += ev.answer;
        for (const tok of tokenize(ev.answer)) sseSend(res, 'token', { text: tok });
      }
    }
    sseSend(res, 'done', {});

    // Persist the completed turn so the user can resume this conversation
    // later. No-op for the anonymous user (client caches locally instead).
    if (answer) {
      const at = new Date().toISOString();
      const turns: ChatTurn[] = [
        { role: 'user', content: message, at },
        { role: 'assistant', content: answer, citations, at },
      ];
      appendChatTurns(getUserId(req), repoId, turns).catch((e) =>
        console.error('[chat] failed to persist history', e),
      );
    }
  } catch (e) {
    sseSend(res, 'error', { message: (e as Error).message });
  }
  res.end();
});

/** GET /api/chat/:repoId/history — the user's persisted turns for a repo. */
chatRouter.get('/:repoId/history', async (req: Request, res: Response) => {
  const { repoId } = req.params;
  if (!(await enforceOwnership(req, res, repoId))) return;
  try {
    const turns = await getChatHistory(getUserId(req), repoId);
    return res.json({ turns });
  } catch {
    // History is a convenience layer; degrade to empty rather than erroring.
    return res.json({ turns: [] });
  }
});

/** DELETE /api/chat/:repoId/history — clear the user's turns for a repo. */
chatRouter.delete('/:repoId/history', async (req: Request, res: Response) => {
  const { repoId } = req.params;
  if (!(await enforceOwnership(req, res, repoId))) return;
  try {
    await clearChatHistory(getUserId(req), repoId);
    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: `Could not clear history: ${(e as Error).message}` });
  }
});
