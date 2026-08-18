'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchFileContent } from '@/lib/api';
import type { Citation } from '@/lib/types';

interface FileViewerProps {
  repoId: string;
  citation: Citation;
  onClose: () => void;
}

/** Side panel: shows a file with its cited line range highlighted + scrolled into view. */
export function FileViewer({ repoId, citation, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    fetchFileContent(repoId, citation.filepath)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, citation.filepath]);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center' });
  }, [content, citation]);

  const lines = content?.split('\n') ?? [];

  return (
    <div className="flex h-full flex-col border-l border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-800">
        <div className="truncate font-mono text-sm" title={citation.filepath}>
          {citation.filepath}
          <span className="ml-2 text-gray-400">
            L{citation.startLine}–{citation.endLine}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close file viewer"
          className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {error && (
          <div role="alert" className="p-4 text-sm text-red-600">
            Could not load file: {error}
          </div>
        )}
        {!content && !error && <div className="p-4 text-sm text-gray-500">Loading…</div>}
        {content && (
          <pre className="min-w-full text-xs leading-relaxed">
            <code>
              {lines.map((line, i) => {
                const n = i + 1;
                const highlighted = n >= citation.startLine && n <= citation.endLine;
                const isFirst = n === citation.startLine;
                return (
                  <div
                    key={n}
                    ref={isFirst ? highlightRef : undefined}
                    className={
                      highlighted
                        ? 'bg-yellow-100 dark:bg-yellow-500/20'
                        : undefined
                    }
                  >
                    <span className="mr-4 inline-block w-10 select-none text-right text-gray-400">
                      {n}
                    </span>
                    {line || ' '}
                  </div>
                );
              })}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
