import { z } from 'zod';
import { StructuredToolInterface } from '@langchain/core/tools';
import { defineTool } from './defineTool';
import { queryCodebase } from '../../embeddings';
import { getManifest, getRawFile } from '../../ingest/s3';
import { webSearch } from './webSearch';
import { createIssue } from './github';
import { runLinter, runTests } from '../../sandbox';
import { formatHitsForLlm } from './searchCodebase';

function formatSandbox(r: { command: string; stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }): string {
  return `$ ${r.command}\nexit=${r.exitCode}${r.timedOut ? ' (timed out)' : ''}\n${r.stdout}\n${r.stderr}`.slice(0, 4000);
}

/**
 * Strict Zod schemas for every agent tool. These document the tool contracts
 * and can be bound to an LLM for tool-calling; the structured graph currently
 * invokes the underlying backends directly (repo-scoped, deterministic flow).
 */

export const schemas = {
  search_codebase: z.object({
    query: z.string().min(1),
    repoId: z.string().min(1),
    topK: z.number().int().positive().max(20).optional(),
  }),
  get_file_tree: z.object({ repoId: z.string().min(1) }),
  read_file: z.object({ repoId: z.string().min(1), filepath: z.string().min(1) }),
  web_search: z.object({ query: z.string().min(1) }),
  github_api_create_issue: z.object({
    repo: z.string().min(1).describe('owner/repo'),
    title: z.string().min(1),
    body: z.string().min(1),
  }),
  run_linter: z.object({ repoId: z.string().min(1), filepath: z.string().min(1) }),
  run_tests: z.object({ repoId: z.string().min(1), testCommand: z.string().optional() }),
} as const;

/** All agent tools as LangChain `StructuredTool`s. */
export function getAllTools(): StructuredToolInterface[] {
  return [
    defineTool(
      async ({ query, repoId, topK }) => formatHitsForLlm(await queryCodebase(repoId, query, topK ?? 8)),
      {
        name: 'search_codebase',
        description:
          'Semantic search over the indexed repository. Returns relevant code chunks with file paths and line numbers.',
        schema: schemas.search_codebase,
      },
    ),
    defineTool(
      async ({ repoId }) => {
        const manifest = await getManifest(repoId);
        return manifest.files.map((f) => f.filepath).join('\n');
      },
      {
        name: 'get_file_tree',
        description: "Lists every indexed file path in the repository (its structure).",
        schema: schemas.get_file_tree,
      },
    ),
    defineTool(async ({ repoId, filepath }) => getRawFile(repoId, filepath), {
      name: 'read_file',
      description: 'Fetches the full contents of a single file in the repository.',
      schema: schemas.read_file,
    }),
    defineTool(async ({ query }) => webSearch(query), {
      name: 'web_search',
      description: 'Searches the web for external/library documentation not in the repo.',
      schema: schemas.web_search,
    }),
    defineTool(
      async ({ repo, title, body }) => {
        const res = await createIssue(repo, title, body);
        return `Created issue #${res.number}: ${res.url}`;
      },
      {
        name: 'github_api_create_issue',
        description: 'Creates a GitHub issue. Only use when the user explicitly requests it.',
        schema: schemas.github_api_create_issue,
      },
    ),
    defineTool(async ({ repoId, filepath }) => formatSandbox(await runLinter(repoId, filepath)), {
      name: 'run_linter',
      description: 'Runs a linter on a repo file inside an isolated Docker sandbox (no network).',
      schema: schemas.run_linter,
    }),
    defineTool(
      async ({ repoId, testCommand }) => formatSandbox(await runTests(repoId, testCommand)),
      {
        name: 'run_tests',
        description: 'Runs tests against the repo inside an isolated Docker sandbox (no network).',
        schema: schemas.run_tests,
      },
    ),
  ];
}
