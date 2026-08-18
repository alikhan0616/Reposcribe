"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/lib/useChat";
import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import type { Citation as CitationType } from "@/lib/types";

interface ChatProps {
  repoId: string;
  onCitationSelect: (citation: CitationType) => void;
}

/** The conversation surface: message list + composer. */
export function Chat({ repoId, onCitationSelect }: ChatProps) {
  const { messages, send, isStreaming, clear } = useChat(repoId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {messages.length > 0 && (
        <div className="flex shrink-0 justify-end border-b border-gray-100 px-4 py-1.5 dark:border-gray-800">
          <button
            type="button"
            onClick={clear}
            disabled={isStreaming}
            className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-gray-800"
          >
            Clear chat
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-10 text-center text-gray-500">
            Ask anything about this repository — e.g. “Where is authentication
            handled?”
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} onCitationSelect={onCitationSelect} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0">
        <ChatInput onSend={send} disabled={isStreaming} />
      </div>
    </div>
  );
}
