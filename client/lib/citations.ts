import type { Citation } from './types';

const CITATION_RE = /^(.+):(\d+)-(\d+)$/;

/** Parses `filepath:startLine-endLine` into a structured Citation, or null. */
export function parseCitation(raw: string): Citation | null {
  const m = CITATION_RE.exec(raw.trim());
  if (!m) return null;
  return {
    raw: raw.trim(),
    filepath: m[1],
    startLine: parseInt(m[2], 10),
    endLine: parseInt(m[3], 10),
  };
}
