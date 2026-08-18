import { getAllTools, schemas } from '../../src/services/agent/tools/definitions';

describe('agent tool definitions', () => {
  it('exposes all expected tools with correct names', () => {
    const names = getAllTools().map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'get_file_tree',
        'github_api_create_issue',
        'read_file',
        'run_linter',
        'run_tests',
        'search_codebase',
        'web_search',
      ].sort(),
    );
  });

  it('every tool carries a description and a schema', () => {
    for (const t of getAllTools()) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.schema).toBeDefined();
    }
  });

  it('schemas accept valid input and reject invalid input', () => {
    expect(schemas.search_codebase.safeParse({ query: 'x', repoId: 'r' }).success).toBe(true);
    expect(schemas.search_codebase.safeParse({ query: '', repoId: 'r' }).success).toBe(false);
    expect(schemas.read_file.safeParse({ repoId: 'r', filepath: 'a.ts' }).success).toBe(true);
    expect(schemas.read_file.safeParse({ repoId: 'r' }).success).toBe(false);
    expect(
      schemas.github_api_create_issue.safeParse({ repo: 'o/r', title: 't', body: 'b' }).success,
    ).toBe(true);
    expect(schemas.github_api_create_issue.safeParse({ repo: 'o/r', title: 't' }).success).toBe(
      false,
    );
  });
});
