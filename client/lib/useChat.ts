'use client';

import { useCallback, useEffect, useState } from 'react';
import { streamChat } from './chatStream';
import { getServerChatHistory, clearServerChatHistory } from './api';
import {
  getCachedTurns,
  setCachedTurns,
  appendCachedTurns,
  clearCachedTurns,
  turnsToMessages,
} from './chatHistory';
import { authEnabled } from './auth';
import { useUserId } from './userContext';
import type { ChatMessage, ChatTurn } from './types';

let idCounter = 0;
const nextId = () => `m${Date.now()}_${idCounter++}`;

/** Manages chat state and drives the SSE stream for one repo. */
export function useChat(repoId: string) {
  const userId = useUserId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Seed the conversation: instantly from the localStorage cache, then (when
  // auth is on) reconcile with the server's persisted history so a signed-in
  // user resumes the same conversation on any device.
  useEffect(() => {
    setHydrated(false);
    const cached = getCachedTurns(userId, repoId);
    setMessages(turnsToMessages(cached));
    setHydrated(true);

    if (!authEnabled) return;
    let cancelled = false;
    getServerChatHistory(repoId)
      .then((turns) => {
        if (cancelled || turns.length === 0) return;
        setCachedTurns(userId, repoId, turns);
        setMessages(turnsToMessages(turns));
      })
      .catch(() => {
        // Offline / server down — keep the cached conversation.
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, userId]);

  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  /** Wipes the conversation locally and (when auth is on) on the server. */
  const clear = useCallback(() => {
    setMessages([]);
    clearCachedTurns(userId, repoId);
    if (authEnabled) void clearServerChatHistory(repoId);
  }, [repoId, userId]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const history = messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: trimmed,
        trace: [],
        citations: [],
        streaming: false,
      };
      const assistantId = nextId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        trace: [],
        citations: [],
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // Accumulate the assistant's output so we can persist the turn on success.
      let answer = '';
      let citations: string[] = [];
      let failed = false;

      try {
        await streamChat(
          { repoId, message: trimmed, history },
          {
            onTrace: (call) =>
              patch(assistantId, (m) => ({ ...m, trace: [...m.trace, call] })),
            onCitations: (c) => {
              citations = c;
              patch(assistantId, (m) => ({ ...m, citations: c }));
            },
            onToken: (t) => {
              answer += t;
              patch(assistantId, (m) => ({ ...m, content: m.content + t }));
            },
            onError: (msg) => {
              failed = true;
              patch(assistantId, (m) => ({ ...m, error: msg }));
            },
            onDone: () => patch(assistantId, (m) => ({ ...m, streaming: false })),
          },
        );
      } catch (e) {
        failed = true;
        patch(assistantId, (m) => ({ ...m, error: (e as Error).message, streaming: false }));
      } finally {
        patch(assistantId, (m) => ({ ...m, streaming: false }));
        setIsStreaming(false);
      }

      // Cache the completed turn locally. The server persists its own copy in
      // the /api/chat handler (when auth is on), so we only cache here.
      if (!failed && answer) {
        const at = new Date().toISOString();
        const turns: ChatTurn[] = [
          { role: 'user', content: trimmed, at },
          { role: 'assistant', content: answer, citations, at },
        ];
        appendCachedTurns(userId, repoId, turns);
      }
    },
    [isStreaming, messages, patch, repoId, userId],
  );

  return { messages, send, isStreaming, clear, hydrated };
}
