import { buildRunArgs, runLinter, runTests } from '../../src/services/sandbox/runner';
import type { SandboxDeps } from '../../src/services/sandbox/runner';
import type { ExecResult } from '../../src/services/sandbox/exec';

function makeDeps(over: Partial<SandboxDeps> = {}) {
  const exec = jest.fn(
    async (_args: string[], _timeoutMs?: number): Promise<ExecResult> => ({
      stdout: 'lint output',
      stderr: '',
      code: 0,
      timedOut: false,
    }),
  );
  const deps: SandboxDeps = {
    ensureImage: jest.fn(async () => undefined),
    prepare: jest.fn(async () => '/tmp/ws'),
    listFiles: jest.fn(async () => ['a.ts', 'b.ts']),
    cleanup: jest.fn(async () => undefined),
    exec,
    ...over,
  };
  return { deps, exec };
}

describe('buildRunArgs', () => {
  it('assembles a hardened, no-network, read-only container invocation', () => {
    const args = buildRunArgs('/tmp/ws', 'reposcribe-sbx-abc', ['sh', '/sandbox/lint.sh', 'a.ts']);
    const joined = args.join(' ');
    expect(args[0]).toBe('run');
    expect(joined).toContain('--rm');
    expect(joined).toContain('--network none');
    expect(joined).toContain('--memory');
    expect(joined).toContain('--cpus');
    expect(joined).toContain('--pids-limit');
    expect(joined).toContain('--read-only');
    expect(joined).toContain('--cap-drop ALL');
    expect(joined).toContain('no-new-privileges');
    expect(joined).toContain(':/workspace:ro');
    expect(joined).toContain('sh /sandbox/lint.sh a.ts');
  });
});

describe('runLinter', () => {
  it('ensures the image, prepares just the target file, runs, and cleans up', async () => {
    const { deps, exec } = makeDeps();
    const result = await runLinter('repo1', 'src/a.ts', deps);

    expect(deps.ensureImage).toHaveBeenCalled();
    expect(deps.prepare).toHaveBeenCalledWith('repo1', ['src/a.ts']);
    expect(deps.cleanup).toHaveBeenCalledWith('/tmp/ws');

    const args = exec.mock.calls[0][0];
    expect(args).toContain('none'); // --network none
    expect(args.join(' ')).toContain('sh /sandbox/lint.sh src/a.ts');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('lint output');
  });

  it('force-removes the container on timeout', async () => {
    const exec = jest
      .fn<Promise<ExecResult>, unknown[]>()
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: null, timedOut: true })
      .mockResolvedValue({ stdout: '', stderr: '', code: 0, timedOut: false });
    const { deps } = makeDeps({ exec });

    const result = await runLinter('repo1', 'src/a.ts', deps);
    expect(result.timedOut).toBe(true);
    // Second exec call is the `rm -f <name>` cleanup.
    const rmArgs = exec.mock.calls[1][0] as string[];
    expect(rmArgs.slice(0, 2)).toEqual(['rm', '-f']);
  });

  it('still cleans up the workspace if the container run throws', async () => {
    const exec = jest.fn(async () => {
      throw new Error('docker exploded');
    });
    const { deps } = makeDeps({ exec: exec as unknown as SandboxDeps['exec'] });
    await expect(runLinter('repo1', 'src/a.ts', deps)).rejects.toThrow('docker exploded');
    expect(deps.cleanup).toHaveBeenCalledWith('/tmp/ws');
  });
});

describe('runTests', () => {
  it('lists repo files, prepares them, and runs the given command', async () => {
    const { deps, exec } = makeDeps();
    await runTests('repo1', 'node --test', deps);

    expect(deps.listFiles).toHaveBeenCalledWith('repo1');
    expect(deps.prepare).toHaveBeenCalledWith('repo1', ['a.ts', 'b.ts']);
    const args = exec.mock.calls[0][0];
    expect(args.join(' ')).toContain('sh -c node --test');
  });
});
