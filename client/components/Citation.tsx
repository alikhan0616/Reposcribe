'use client';

import { parseCitation } from '@/lib/citations';
import type { Citation as CitationType } from '@/lib/types';

interface CitationProps {
  raw: string;
  onSelect: (citation: CitationType) => void;
}

/** A clickable `filepath:start-end` chip that opens the file viewer. */
export function Citation({ raw, onSelect }: CitationProps) {
  const parsed = parseCitation(raw);
  if (!parsed) return <code className="text-xs">{raw}</code>;

  return (
    <button
      type="button"
      onClick={() => onSelect(parsed)}
      title={`Open ${parsed.filepath} (lines ${parsed.startLine}–${parsed.endLine})`}
      className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/50"
    >
      {parsed.filepath}:{parsed.startLine}-{parsed.endLine}
    </button>
  );
}
