'use client';

import type { ToolCall } from '@/lib/types';

const TOOL_ICON: Record<string, string> = {
  router: '🧭',
  search_codebase: '🔍',
  sufficiency_check: '⚖️',
  get_file_tree: '🌲',
  read_file: '📄',
  web_search: '🌐',
  github_api_create_issue: '🐙',
};

function summarize(output: unknown): string {
  if (output == null) return '';
  if (Array.isArray(output)) return `${output.length} result(s)`;
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (typeof o.intent === 'string') return `intent: ${o.intent}`;
    if (typeof o.sufficient === 'boolean') return `sufficient: ${o.sufficient}`;
    if (typeof o.fileCount === 'number') return `${o.fileCount} files`;
    if (typeof o.number === 'number') return `issue #${o.number}`;
    return Object.keys(o).slice(0, 3).join(', ');
  }
  return String(output).slice(0, 60);
}

/** Collapsible panel showing which tools the agent invoked, in order. */
export function ToolTracePanel({ trace }: { trace: ToolCall[] }) {
  if (trace.length === 0) return null;

  return (
    <details className="mb-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:border-gray-800 dark:bg-gray-900/50" open>
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">
        Agent trace{' '}
        <span className="text-gray-500">
          {trace.map((t) => TOOL_ICON[t.tool] ?? '•').join(' → ')}
        </span>
      </summary>
      <ol className="space-y-1 px-3 pb-3">
        {trace.map((t, i) => (
          <li key={i} className="flex items-center gap-2 font-mono text-xs">
            <span aria-hidden>{TOOL_ICON[t.tool] ?? '•'}</span>
            <span className={t.ok ? 'text-gray-700 dark:text-gray-300' : 'text-red-600'}>
              {t.tool}
            </span>
            <span className="text-gray-400">{summarize(t.output)}</span>
            <span className="ml-auto text-gray-400">{t.latencyMs}ms</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
