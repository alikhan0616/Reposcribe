import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { queryCodebase } from '../embeddings';
import { getManifest, getRawFile } from '../ingest/s3';
import { getChatModel } from './llm';
import { webSearch } from './tools/webSearch';
import { createIssue, parseGitHubRepo } from './tools/github';
import { formatHitsForLlm } from './tools/searchCodebase';
import { runLinter, runTests } from '../sandbox';
import { metrics, recordToolCall } from '../metrics';
import { SYSTEM_PROMPT, ROUTER_PROMPT, SUFFICIENCY_PROMPT } from './prompts';
import { env } from '../../config/env';
import type { SearchHit, ToolCall, AgentResult, RepoManifest, SandboxResult } from '../../types';

export type AgentIntent = 'search' | 'structure' | 'action' | 'external' | 'execute';

/** Narrow chat surface — keeps types shallow and lets tests pass a fake. */
export interface ChatInvoker {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
}

/** Injectable backends so the whole graph runs without real LLM/S3/network. */
export interface AgentDeps {
  model: ChatInvoker;
  search: (repoId: string, query: string, topK?: number) => Promise<SearchHit[]>;
  getManifest: (repoId: string) => Promise<RepoManifest>;
  readFile: (repoId: string, filepath: string) => Promise<string>;
  webSearch: (query: string) => Promise<string>;
  createIssue: (repo: string, title: string, body: string) => Promise<{ url: string; number: number }>;
  runLinter: (repoId: string, filepath: string) => Promise<SandboxResult>;
  runTests: (repoId: string, command?: string) => Promise<SandboxResult>;
}

const MAX_FILE_CONTEXT_CHARS = 4000;

const AgentState = Annotation.Root({
  repoId: Annotation<string>(),
  question: Annotation<string>(),
  history: Annotation<BaseMessage[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  intent: Annotation<AgentIntent>({ reducer: (_a, b) => b, default: () => 'search' }),
  issueTitle: Annotation<string | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  issueBody: Annotation<string | undefined>({ reducer: (_a, b) => b, default: () => undefined }),
  execAction: Annotation<'lint' | 'test' | null>({ reducer: (_a, b) => b, default: () => null }),
  execFilepath: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
  execCommand: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
  hits: Annotation<SearchHit[]>({ reducer: (_a, b) => b, default: () => [] }),
  sufficient: Annotation<boolean>({ reducer: (_a, b) => b, default: () => true }),
  needFile: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
  needWeb: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
  extraContext: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  trace: Annotation<ToolCall[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  answer: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
});

type State = typeof AgentState.State;

function citationsFor(hits: SearchHit[]): string[] {
  return hits.map((h) => `${h.chunk.filepath}:${h.chunk.startLine}-${h.chunk.endLine}`);
}

/** Extracts the first JSON object from an LLM response, tolerating code fences. */
function parseJson(content: unknown): Record<string, unknown> {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no json object found');
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function buildGraph(deps: AgentDeps) {
  // --- router: classify intent ---
  const router = async (s: State): Promise<Partial<State>> => {
    const start = Date.now();
    let intent: AgentIntent = 'search';
    let reason = '';
    let issueTitle: string | undefined;
    let issueBody: string | undefined;
    let execAction: 'lint' | 'test' | null = null;
    let execFilepath: string | null = null;
    let execCommand: string | null = null;
    try {
      const res = await deps.model.invoke([
        new SystemMessage(ROUTER_PROMPT),
        new HumanMessage(s.question),
      ]);
      const j = parseJson(res.content);
      const parsed = j.intent as AgentIntent;
      if (['search', 'structure', 'action', 'external', 'execute'].includes(parsed)) intent = parsed;
      reason = typeof j.reason === 'string' ? j.reason : '';
      issueTitle = typeof j.issueTitle === 'string' ? j.issueTitle : undefined;
      issueBody = typeof j.issueBody === 'string' ? j.issueBody : undefined;
      execAction = j.execAction === 'test' || j.execAction === 'lint' ? j.execAction : null;
      execFilepath = typeof j.execFilepath === 'string' ? j.execFilepath : null;
      execCommand = typeof j.execCommand === 'string' ? j.execCommand : null;
    } catch {
      intent = 'search';
    }
    const call: ToolCall = {
      tool: 'router',
      input: { question: s.question },
      output: { intent, reason },
      latencyMs: Date.now() - start,
      ok: true,
    };
    return { intent, issueTitle, issueBody, execAction, execFilepath, execCommand, trace: [call] };
  };

  // --- retrieve: semantic code search ---
  const retrieve = async (s: State): Promise<Partial<State>> => {
    const topK = env.retrievalTopK;
    const start = Date.now();
    const hits = await deps.search(s.repoId, s.question, topK);
    const call: ToolCall = {
      tool: 'search_codebase',
      input: { query: s.question, repoId: s.repoId, topK },
      output: citationsFor(hits),
      latencyMs: Date.now() - start,
      ok: true,
    };
    return { hits, trace: [call] };
  };

  // --- sufficiency: is retrieval enough, or do we expand? ---
  const sufficiency = async (s: State): Promise<Partial<State>> => {
    const start = Date.now();
    let sufficient = s.hits.length > 0;
    let reason = '';
    let needFile: string | null = null;
    let needWeb: string | null = null;
    try {
      const res = await deps.model.invoke([
        new SystemMessage(SUFFICIENCY_PROMPT),
        new HumanMessage(`Question: ${s.question}\n\nRetrieved code:\n${formatHitsForLlm(s.hits)}`),
      ]);
      const j = parseJson(res.content);
      sufficient = Boolean(j.sufficient);
      reason = typeof j.reason === 'string' ? j.reason : '';
      needFile = typeof j.needFile === 'string' && j.needFile !== 'null' ? j.needFile : null;
      needWeb = typeof j.needWeb === 'string' && j.needWeb !== 'null' ? j.needWeb : null;
    } catch {
      // keep heuristic default (sufficient iff we retrieved anything)
    }
    const call: ToolCall = {
      tool: 'sufficiency_check',
      input: { question: s.question, hitCount: s.hits.length },
      output: { sufficient, reason, needFile, needWeb },
      latencyMs: Date.now() - start,
      ok: true,
    };
    return { sufficient, needFile, needWeb, trace: [call] };
  };

  // --- fileTree: structural questions ---
  const fileTree = async (s: State): Promise<Partial<State>> => {
    const start = Date.now();
    const manifest = await deps.getManifest(s.repoId);
    const files = manifest.files.map((f) => f.filepath);
    const call: ToolCall = {
      tool: 'get_file_tree',
      input: { repoId: s.repoId },
      output: { fileCount: files.length },
      latencyMs: Date.now() - start,
      ok: true,
    };
    return {
      extraContext: [`Repository file tree (${files.length} files):\n${files.join('\n')}`],
      trace: [call],
    };
  };

  // --- expand: read a specific file and/or web search ---
  const expand = async (s: State): Promise<Partial<State>> => {
    const calls: ToolCall[] = [];
    const extra: string[] = [];

    if (s.needFile) {
      const start = Date.now();
      try {
        const content = await deps.readFile(s.repoId, s.needFile);
        extra.push(`Full contents of ${s.needFile}:\n${content.slice(0, MAX_FILE_CONTEXT_CHARS)}`);
        calls.push({
          tool: 'read_file',
          input: { repoId: s.repoId, filepath: s.needFile },
          output: { bytes: content.length },
          latencyMs: Date.now() - start,
          ok: true,
        });
      } catch (e) {
        calls.push({
          tool: 'read_file',
          input: { repoId: s.repoId, filepath: s.needFile },
          output: null,
          latencyMs: Date.now() - start,
          ok: false,
          error: (e as Error).message,
        });
      }
    }

    const webQuery = s.needWeb ?? (s.intent === 'external' ? s.question : null);
    if (webQuery) {
      const start = Date.now();
      try {
        const result = await deps.webSearch(webQuery);
        extra.push(`Web search results for "${webQuery}":\n${result}`);
        calls.push({
          tool: 'web_search',
          input: { query: webQuery },
          output: { chars: result.length },
          latencyMs: Date.now() - start,
          ok: true,
        });
      } catch (e) {
        calls.push({
          tool: 'web_search',
          input: { query: webQuery },
          output: null,
          latencyMs: Date.now() - start,
          ok: false,
          error: (e as Error).message,
        });
      }
    }

    return { extraContext: extra, trace: calls };
  };

  // --- action: create a GitHub issue on explicit request ---
  const action = async (s: State): Promise<Partial<State>> => {
    const start = Date.now();
    try {
      const manifest = await deps.getManifest(s.repoId);
      const repo = parseGitHubRepo(manifest.repoUrl);
      if (!repo) throw new Error('could not determine owner/repo from manifest');
      const title = s.issueTitle ?? 'Issue created via RepoScribe';
      const body = s.issueBody ?? s.question;
      const res = await deps.createIssue(repo, title, body);
      return {
        extraContext: [`Created GitHub issue #${res.number}: ${res.url}`],
        trace: [
          {
            tool: 'github_api_create_issue',
            input: { repo, title },
            output: res,
            latencyMs: Date.now() - start,
            ok: true,
          },
        ],
      };
    } catch (e) {
      const error = (e as Error).message;
      return {
        extraContext: [`Failed to create GitHub issue: ${error}`],
        trace: [
          {
            tool: 'github_api_create_issue',
            input: { repoId: s.repoId },
            output: null,
            latencyMs: Date.now() - start,
            ok: false,
            error,
          },
        ],
      };
    }
  };

  // --- codeExec: run a linter or tests in the Docker sandbox ---
  const codeExec = async (s: State): Promise<Partial<State>> => {
    const start = Date.now();
    const action = s.execAction ?? (s.execFilepath ? 'lint' : 'test');
    const tool = action === 'test' ? 'run_tests' : 'run_linter';
    try {
      const result =
        action === 'test'
          ? await deps.runTests(s.repoId, s.execCommand ?? undefined)
          : await deps.runLinter(s.repoId, s.execFilepath ?? '');
      const body = [
        `$ ${result.command}`,
        `exit=${result.exitCode}${result.timedOut ? ' (TIMED OUT)' : ''}`,
        result.stdout && `stdout:\n${result.stdout}`,
        result.stderr && `stderr:\n${result.stderr}`,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);
      return {
        extraContext: [`Sandbox ${tool} result:\n${body}`],
        trace: [
          {
            tool,
            input: { repoId: s.repoId, filepath: s.execFilepath, command: s.execCommand },
            output: { exitCode: result.exitCode, timedOut: result.timedOut },
            latencyMs: Date.now() - start,
            ok: true,
          },
        ],
      };
    } catch (e) {
      const error = (e as Error).message;
      return {
        extraContext: [`Sandbox ${tool} failed: ${error}`],
        trace: [
          {
            tool,
            input: { repoId: s.repoId },
            output: null,
            latencyMs: Date.now() - start,
            ok: false,
            error,
          },
        ],
      };
    }
  };

  // --- generate: synthesize the final answer ---
  const generate = async (s: State): Promise<Partial<State>> => {
    const parts: string[] = [];
    if (s.hits.length > 0) parts.push(`Retrieved code:\n${formatHitsForLlm(s.hits)}`);
    parts.push(...s.extraContext);
    const context = parts.join('\n\n---\n\n') || 'No additional context was gathered.';

    const res = await deps.model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      ...s.history,
      new HumanMessage(`Question: ${s.question}\n\n${context}`),
    ]);
    const answer = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    return { answer };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = new StateGraph(AgentState);
  builder
    .addNode('router', router)
    .addNode('retrieve', retrieve)
    .addNode('sufficiency', sufficiency)
    .addNode('fileTree', fileTree)
    .addNode('expand', expand)
    .addNode('action', action)
    .addNode('codeExec', codeExec)
    .addNode('generate', generate)
    .addEdge(START, 'router')
    .addConditionalEdges('router', (s: State) => s.intent, {
      search: 'retrieve',
      structure: 'fileTree',
      action: 'action',
      external: 'expand',
      execute: 'codeExec',
    })
    .addEdge('retrieve', 'sufficiency')
    .addConditionalEdges('sufficiency', (s: State) => (s.sufficient ? 'generate' : 'expand'), {
      generate: 'generate',
      expand: 'expand',
    })
    .addEdge('fileTree', 'generate')
    .addEdge('expand', 'generate')
    .addEdge('action', 'generate')
    .addEdge('codeExec', 'generate')
    .addEdge('generate', END);

  return builder.compile() as unknown as CompiledAgentGraph;
}

type GraphInput = { repoId: string; question: string; history: BaseMessage[] };

interface CompiledAgentGraph {
  invoke(input: GraphInput): Promise<State>;
  stream(
    input: GraphInput,
    opts: { streamMode: 'updates' },
  ): Promise<AsyncIterable<Record<string, Partial<State> | undefined>>>;
}

const defaultDeps = (): AgentDeps => ({
  model: getChatModel(),
  search: queryCodebase,
  getManifest,
  readFile: getRawFile,
  webSearch,
  createIssue,
  runLinter,
  runTests,
});

export interface RunAgentInput {
  repoId: string;
  question: string;
  history?: BaseMessage[];
}

/** Runs the full agent graph for one turn and returns answer + tool trace. */
export async function runAgent(
  input: RunAgentInput,
  deps?: Partial<AgentDeps>,
): Promise<AgentResult> {
  const resolved: AgentDeps = { ...defaultDeps(), ...deps };
  const graph = buildGraph(resolved);
  const start = Date.now();
  const final = await graph.invoke({
    repoId: input.repoId,
    question: input.question,
    history: input.history ?? [],
  });
  metrics.incr('agent.turns');
  metrics.observe('agent.turn_latency_ms', Date.now() - start);
  for (const call of final.trace) recordToolCall(call.tool, call.latencyMs, call.ok);
  return {
    answer: final.answer,
    trace: final.trace,
    citations: citationsFor(final.hits),
  };
}

/** Streaming event emitted as the agent progresses, for SSE to the client. */
export type AgentStreamEvent =
  | { type: 'trace'; call: ToolCall }
  | { type: 'citations'; citations: string[] }
  | { type: 'answer'; answer: string };

/**
 * Runs the agent, yielding events live as each node completes: `trace` per tool
 * call (so the UI trace panel fills in real time), then `citations` and the
 * final `answer`. The chat route turns these into SSE frames.
 */
export async function* streamAgent(
  input: RunAgentInput,
  deps?: Partial<AgentDeps>,
): AsyncGenerator<AgentStreamEvent> {
  const resolved: AgentDeps = { ...defaultDeps(), ...deps };
  const graph = buildGraph(resolved);
  let hits: SearchHit[] = [];
  const start = Date.now();

  const stream = await graph.stream(
    { repoId: input.repoId, question: input.question, history: input.history ?? [] },
    { streamMode: 'updates' },
  );

  for await (const update of stream) {
    for (const node of Object.keys(update)) {
      const partial = update[node];
      if (!partial) continue;
      if (partial.hits) hits = partial.hits;
      if (partial.trace) {
        for (const call of partial.trace) {
          recordToolCall(call.tool, call.latencyMs, call.ok);
          yield { type: 'trace', call };
        }
      }
      if (typeof partial.answer === 'string') {
        yield { type: 'citations', citations: citationsFor(hits) };
        yield { type: 'answer', answer: partial.answer };
      }
    }
  }

  metrics.incr('agent.turns');
  metrics.observe('agent.turn_latency_ms', Date.now() - start);
}
