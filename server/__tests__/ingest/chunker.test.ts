import { chunkFile, computeLineRange } from '../../src/services/ingest/chunker';

describe('computeLineRange', () => {
  const content = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');

  it('computes 1-based inclusive line ranges for a known chunk', () => {
    const chunk = 'line2\nline3';
    const { startLine, endLine } = computeLineRange(content, chunk, 0);
    expect(startLine).toBe(2);
    expect(endLine).toBe(3);
  });

  it('reports startLine 1 for a chunk at the top of the file', () => {
    const chunk = 'line1\nline2';
    const { startLine, endLine } = computeLineRange(content, chunk, 0);
    expect(startLine).toBe(1);
    expect(endLine).toBe(2);
  });

  it('respects fromIndex when the same text repeats', () => {
    const repeated = 'foo\nfoo\nfoo';
    const first = computeLineRange(repeated, 'foo', 0);
    expect(first.startLine).toBe(1);
    const second = computeLineRange(repeated, 'foo', first.nextIndex);
    expect(second.startLine).toBe(2);
  });

  it('falls back gracefully to a trimmed match', () => {
    const c = 'alpha\nbeta\ngamma';
    const { startLine, endLine } = computeLineRange(c, '  beta  ', 0);
    expect(startLine).toBe(2);
    expect(endLine).toBe(2);
  });
});

describe('chunkFile', () => {
  const repoId = 'repo123';

  it('produces a single chunk with correct metadata for small content', async () => {
    const content = 'const a = 1;\nconst b = 2;\n';
    const chunks = await chunkFile(repoId, 'src/small.ts', content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      id: 'repo123:src/small.ts:0',
      repoId,
      filepath: 'src/small.ts',
      language: 'typescript',
      chunkIndex: 0,
      startLine: 1,
    });
  });

  it('produces multiple, sequentially-indexed chunks for large content', async () => {
    // ~2500 chars → more than one 1000-char chunk.
    const content = Array.from({ length: 120 }, (_, i) => `const value${i} = compute(${i});`).join(
      '\n',
    );
    const chunks = await chunkFile(repoId, 'src/big.ts', content);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(c.id).toBe(`repo123:src/big.ts:${i}`);
      expect(c.startLine).toBeGreaterThanOrEqual(1);
      expect(c.endLine).toBeGreaterThanOrEqual(c.startLine);
      expect(c.text.length).toBeGreaterThan(0);
    });

    // Line ranges should advance through the file.
    expect(chunks[chunks.length - 1].endLine).toBeGreaterThan(chunks[0].endLine);
  });

  it('uses the plain splitter and text language for unsupported extensions', async () => {
    const content = '{"a": 1, "b": [1, 2, 3]}';
    const chunks = await chunkFile(repoId, 'data.json', content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].language).toBe('json');
  });

  it('returns no chunks for empty content', async () => {
    const chunks = await chunkFile(repoId, 'src/empty.ts', '');
    expect(chunks).toHaveLength(0);
  });
});
