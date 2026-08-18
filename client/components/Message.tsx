'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ToolTracePanel } from './ToolTracePanel';
import { Citation } from './Citation';
import type { ChatMessage, Citation as CitationType } from '@/lib/types';

interface MessageProps {
  message: ChatMessage;
  onCitationSelect: (citation: CitationType) => void;
}

/** Renders one chat message: user bubble, or agent trace + markdown + sources. */
export function Message({ message, onCitationSelect }: MessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-testid="user-message">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start" data-testid="agent-message">
      <div className="w-full max-w-[90%]">
        <ToolTracePanel trace={message.trace} />

        {message.error ? (
          <div role="alert" className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {message.error}
          </div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content || (message.streaming ? '…' : '')}
            </ReactMarkdown>
          </div>
        )}

        {message.streaming && (
          <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-gray-400 align-middle" aria-hidden />
        )}

        {message.citations.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              Sources
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="citations">
              {message.citations.map((c) => (
                <Citation key={c} raw={c} onSelect={onCitationSelect} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
