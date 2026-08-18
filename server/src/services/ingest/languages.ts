import path from 'path';

/** Languages LangChain's RecursiveCharacterTextSplitter understands. */
export type SplitterLanguage =
  | 'cpp'
  | 'go'
  | 'java'
  | 'js'
  | 'php'
  | 'proto'
  | 'python'
  | 'rst'
  | 'ruby'
  | 'rust'
  | 'scala'
  | 'swift'
  | 'markdown'
  | 'latex'
  | 'html'
  | 'sol';

interface LangInfo {
  /** Human-readable language stored in chunk metadata. */
  display: string;
  /** Splitter language, or null to fall back to the plain recursive splitter. */
  splitter: SplitterLanguage | null;
}

/**
 * Allow-listed extensions → language. Anything not in this map is excluded
 * from ingestion entirely (binaries, images, config we don't index, etc.).
 */
export const EXTENSION_MAP: Record<string, LangInfo> = {
  '.js': { display: 'javascript', splitter: 'js' },
  '.jsx': { display: 'javascript', splitter: 'js' },
  '.mjs': { display: 'javascript', splitter: 'js' },
  '.cjs': { display: 'javascript', splitter: 'js' },
  '.ts': { display: 'typescript', splitter: 'js' },
  '.tsx': { display: 'typescript', splitter: 'js' },
  '.py': { display: 'python', splitter: 'python' },
  '.java': { display: 'java', splitter: 'java' },
  '.go': { display: 'go', splitter: 'go' },
  '.rb': { display: 'ruby', splitter: 'ruby' },
  '.rs': { display: 'rust', splitter: 'rust' },
  '.php': { display: 'php', splitter: 'php' },
  '.c': { display: 'c', splitter: 'cpp' },
  '.h': { display: 'c', splitter: 'cpp' },
  '.cpp': { display: 'cpp', splitter: 'cpp' },
  '.cc': { display: 'cpp', splitter: 'cpp' },
  '.hpp': { display: 'cpp', splitter: 'cpp' },
  '.scala': { display: 'scala', splitter: 'scala' },
  '.swift': { display: 'swift', splitter: 'swift' },
  '.sol': { display: 'solidity', splitter: 'sol' },
  '.proto': { display: 'protobuf', splitter: 'proto' },
  '.md': { display: 'markdown', splitter: 'markdown' },
  '.markdown': { display: 'markdown', splitter: 'markdown' },
  '.html': { display: 'html', splitter: 'html' },
  '.htm': { display: 'html', splitter: 'html' },
  '.tex': { display: 'latex', splitter: 'latex' },
  '.json': { display: 'json', splitter: null },
  '.yaml': { display: 'yaml', splitter: null },
  '.yml': { display: 'yaml', splitter: null },
  '.toml': { display: 'toml', splitter: null },
  '.txt': { display: 'text', splitter: null },
};

/** Set of allow-listed extensions (with leading dot, lowercase). */
export const ALLOWED_EXTENSIONS = new Set(Object.keys(EXTENSION_MAP));

/** Returns language info for a file path, or null if the extension isn't allowed. */
export function languageForFile(filepath: string): LangInfo | null {
  const ext = path.extname(filepath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}
