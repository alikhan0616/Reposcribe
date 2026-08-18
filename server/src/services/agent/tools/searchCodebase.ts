import type { SearchHit } from '../../../types';

/** Renders search hits into a compact, citation-friendly block for the LLM prompt. */
export function formatHitsForLlm(hits: SearchHit[]): string {
  if (hits.length === 0) return 'No relevant code was found in the repository.';
  return hits
    .map((h, i) => {
      const c = h.chunk;
      return `[${i + 1}] ${c.filepath}:${c.startLine}-${c.endLine} (${c.language}, score ${h.score.toFixed(
        3,
      )})\n${c.text}`;
    })
    .join('\n\n---\n\n');
}
