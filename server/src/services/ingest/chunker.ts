import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../../config/ingest';
import { languageForFile } from './languages';
import type { CodeChunk } from '../../types';

export interface LineRange {
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
  /** Where the next chunk search should resume in the source content. */
  nextIndex: number;
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) n++;
  }
  return n;
}

/**
 * Locates `chunkText` in `content` (starting at `fromIndex`) and derives the
 * 1-based inclusive line range it covers. The splitter may trim surrounding
 * whitespace, so we fall back to a trimmed match, then a from-start match.
 */
export function computeLineRange(
  content: string,
  chunkText: string,
  fromIndex: number,
): LineRange {
  let matchText = chunkText;
  let idx = content.indexOf(chunkText, fromIndex);

  if (idx === -1) {
    matchText = chunkText.trim();
    idx = content.indexOf(matchText, fromIndex);
    if (idx === -1) idx = content.indexOf(matchText);
  }

  if (idx === -1) {
    // Give up gracefully rather than throwing — never lose a chunk over metadata.
    const startLine = countNewlines(content.slice(0, Math.min(fromIndex, content.length))) + 1;
    return { startLine, endLine: startLine, nextIndex: fromIndex };
  }

  const startLine = countNewlines(content.slice(0, idx)) + 1;
  const endLine = startLine + countNewlines(matchText);
  // Advance past the start (not the end) so overlapping next chunks are found.
  return { startLine, endLine, nextIndex: idx + 1 };
}

/**
 * Splits a single file's content into `CodeChunk`s with citation line metadata.
 * Uses a language-aware splitter when available, else the plain recursive one.
 */
export async function chunkFile(
  repoId: string,
  filepath: string,
  content: string,
): Promise<CodeChunk[]> {
  const info = languageForFile(filepath);
  const display = info?.display ?? 'text';

  const splitter = info?.splitter
    ? RecursiveCharacterTextSplitter.fromLanguage(info.splitter, {
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      })
    : new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      });

  const texts = await splitter.splitText(content);

  const chunks: CodeChunk[] = [];
  let cursor = 0;
  texts.forEach((text, chunkIndex) => {
    const { startLine, endLine, nextIndex } = computeLineRange(content, text, cursor);
    cursor = nextIndex;
    chunks.push({
      id: `${repoId}:${filepath}:${chunkIndex}`,
      text,
      repoId,
      filepath,
      language: display,
      chunkIndex,
      startLine,
      endLine,
    });
  });

  return chunks;
}
