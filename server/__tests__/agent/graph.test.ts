import { runAgent } from '../../src/services/agent/graph';
import type { ChatInvoker } from '../../src/services/agent/graph';
import type { SearchHit, RepoManifest } from '../../src/types';

function hit(filepath: string, s: number, e: number, text: string): SearchHit {
  return {
    score: 0.9,
    chunk: { id: `repo1:${filepath}:0`, text, repoId: 'repo1', filepath, language: 'typescript', chunkIndex: 0, startLine: s, endLine: e },
  };
}

const MANIFEST: RepoManifest = {
  repoId: 'repo1',
  repoUrl: 'https://github.com/acme/widget',
  createdAt: '2026-01-01T00:00:00Z',
  fileCount: 2,
  totalBytes: 20,
  files: [
    { filepath: 'src/a.ts', s3Key: 'k1', size: 10, language: 'typescript' },
    { filepath: 'README.md', s3Key: 'k2', size: 10, language: 'markdown' },
  ],
};

interface ModelOpts {
  intent?: string;
  issueTitle?: string;
  issueBody?: string;
  sufficient?: boolean;
  needFile?: string | null;
  needWeb?: string | null;
  answer?: string;
}

/** Fake model that responds based on which system prompt it was given. */
function makeDeps(opts: ModelOpts) {
  const invoke = jest.fn(async (messages: Array<{ content: unknown }>) => {
    const sys = String(messages[0]?.content ?? '');
    if (sys.includes('Classify')) {
      return {
        content: JSON.stringify({
          intent: opts.intent ?? 'search',
          reason: 'r',
          issueTitle: opts.issueTitle,
          issueBody: opts.issueBody,
        }),
      };
    }
    if (sys.includes('judging whether')) {
      return {
        content: JSON.stringify({
          sufficient: opts.sufficient ?? true,
          reason: 'r',
          needFile: opts.needFile ?? null,
          needWeb: opts.needWeb ?? null,
        }),
      };
    }
    return { content: opts.answer ?? 'final answer' };
  });

  const search = jest.fn(async () => [hit('src/a.ts', 10, 30, 'export function run() {}')]);
  const getManifest = jest.fn(async () => MANIFEST);
  const readFile = jest.fn(async () => 'FULL FILE CONTENTS');
  const webSearch = jest.fn(async () => 'WEB RESULTS');
  const createIssue = jest.fn(async () => ({
    url: 'https://github.com/acme/widget/issues/1',
    number: 1,
  }));
  const runLinter = jest.fn(async () => ({
    command: 'sh /sandbox/lint.sh src/a.ts',
    stdout: '2 problems',
    stderr: '',
    exitCode: 1,
    timedOut: false,
  }));
  const runTests = jest.fn(async () => ({
    command: 'sh -c node --test',
    stdout: 'ok',
    stderr: '',
    exitCode: 0,
    timedOut: false,
  }));

  const deps = {
    model: { invoke } as unknown as ChatInvoker,
    search,
    getManifest,
    readFile,
    webSearch,
    createIssue,
    runLinter,
    runTests,
  };
  return { deps, invoke, search, getManifest, readFile, webSearch, createIssue, runLinter, runTests };
}

const tools = (r: { trace: { tool: string }[] }) => r.trace.map((t) => t.tool);

describe('runAgent — full graph routing', () => {
  it('search intent → router → retrieve → sufficiency → generate', async () => {
    const { deps, search } = makeDeps({ intent: 'search', sufficient: true, answer: 'A' });
    const res = await runAgent({ repoId: 'repo1', question: 'where is run defined?' }, deps);

    expect(tools(res)).toEqual(['router', 'search_codebase', 'sufficiency_check']);
    expect(res.answer).toBe('A');
    expect(res.citations).toEqual(['src/a.ts:10-30']);
    expect(search).toHaveBeenCalledWith('repo1', 'where is run defined?', expect.any(Number));
  });

  it('structure intent → router → get_file_tree → generate', async () => {
    const { deps, getManifest, search } = makeDeps({ intent: 'structure' });
    const res = await runAgent({ repoId: 'repo1', question: 'what files are in this project?' }, deps);

    expect(tools(res)).toEqual(['router', 'get_file_tree']);
    expect(getManifest).toHaveBeenCalledWith('repo1');
    expect(search).not.toHaveBeenCalled();
  });

  it('action intent → router → github_api_create_issue → generate', async () => {
    const { deps, createIssue } = makeDeps({
      intent: 'action',
      issueTitle: 'Bug: crash on empty input',
      issueBody: 'It crashes.',
    });
    const res = await runAgent({ repoId: 'repo1', question: 'open an issue about the crash' }, deps);

    expect(tools(res)).toEqual(['router', 'github_api_create_issue']);
    // owner/repo parsed from the manifest's repoUrl.
    expect(createIssue).toHaveBeenCalledWith('acme/widget', 'Bug: crash on empty input', 'It crashes.');
  });

  it('external intent → router → web_search → generate', async () => {
    const { deps, webSearch } = makeDeps({ intent: 'external' });
    const res = await runAgent(
      { repoId: 'repo1', question: 'what does the express Router API do?' },
      deps,
    );

    expect(tools(res)).toEqual(['router', 'web_search']);
    expect(webSearch).toHaveBeenCalled();
  });

  it('insufficient retrieval triggers expansion via read_file', async () => {
    const { deps, readFile } = makeDeps({
      intent: 'search',
      sufficient: false,
      needFile: 'src/a.ts',
    });
    const res = await runAgent({ repoId: 'repo1', question: 'how does run() work end to end?' }, deps);

    expect(tools(res)).toEqual(['router', 'search_codebase', 'sufficiency_check', 'read_file']);
    expect(readFile).toHaveBeenCalledWith('repo1', 'src/a.ts');
  });

  it('execute intent → router → run_linter (sandbox) → generate', async () => {
    const { deps, runLinter } = makeDeps({ intent: 'execute' });
    // Router also supplies the exec fields; extend the model to include them.
    (deps.model.invoke as jest.Mock).mockImplementation(async (messages: Array<{ content: unknown }>) => {
      const sys = String(messages[0]?.content ?? '');
      if (sys.includes('Classify')) {
        return { content: JSON.stringify({ intent: 'execute', execAction: 'lint', execFilepath: 'src/a.ts' }) };
      }
      return { content: 'done' };
    });

    const res = await runAgent({ repoId: 'repo1', question: 'lint src/a.ts' }, deps);
    expect(tools(res)).toEqual(['router', 'run_linter']);
    expect(runLinter).toHaveBeenCalledWith('repo1', 'src/a.ts');
  });

  it('falls back to search intent when the router returns non-JSON', async () => {
    const { deps } = makeDeps({ answer: 'not json at all' });
    // Override the model to always return prose (no valid JSON anywhere).
    (deps.model.invoke as jest.Mock).mockImplementation(async () => ({ content: 'prose only' }));

    const res = await runAgent({ repoId: 'repo1', question: 'anything' }, deps);
    // Non-JSON router → default 'search'; non-JSON sufficiency → heuristic (hits>0 = true).
    expect(tools(res)).toEqual(['router', 'search_codebase', 'sufficiency_check']);
  });

  it('records latency and ok flags on every trace entry', async () => {
    const { deps } = makeDeps({ intent: 'search', sufficient: true });
    const res = await runAgent({ repoId: 'repo1', question: 'q' }, deps);
    for (const t of res.trace) {
      expect(typeof t.latencyMs).toBe('number');
      expect(typeof t.ok).toBe('boolean');
    }
  });
});
