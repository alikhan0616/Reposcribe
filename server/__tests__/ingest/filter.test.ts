import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { isAllowedFile, walkRepo } from '../../src/services/ingest/filter';

describe('isAllowedFile', () => {
  it('allows allow-listed source extensions', () => {
    expect(isAllowedFile('src/index.ts')).toBe(true);
    expect(isAllowedFile('app/page.tsx')).toBe(true);
    expect(isAllowedFile('main.py')).toBe(true);
    expect(isAllowedFile('README.md')).toBe(true);
    expect(isAllowedFile('config/data.json')).toBe(true);
    expect(isAllowedFile('pkg/server.go')).toBe(true);
  });

  it('rejects ignored directories regardless of extension', () => {
    expect(isAllowedFile('node_modules/left-pad/index.js')).toBe(false);
    expect(isAllowedFile('.git/config')).toBe(false);
    expect(isAllowedFile('dist/bundle.js')).toBe(false);
    expect(isAllowedFile('build/out.js')).toBe(false);
    expect(isAllowedFile('.next/static/chunk.js')).toBe(false);
    expect(isAllowedFile('coverage/lcov.js')).toBe(false);
  });

  it('rejects lockfiles and minified/bundled assets', () => {
    expect(isAllowedFile('package-lock.json')).toBe(false);
    expect(isAllowedFile('yarn.lock')).toBe(false);
    expect(isAllowedFile('pnpm-lock.yaml')).toBe(false);
    expect(isAllowedFile('vendor.min.js')).toBe(false);
    expect(isAllowedFile('bundle.js.map')).toBe(false);
  });

  it('rejects non-allow-listed extensions (binaries/images)', () => {
    expect(isAllowedFile('assets/logo.png')).toBe(false);
    expect(isAllowedFile('fonts/icon.woff2')).toBe(false);
    expect(isAllowedFile('bin/app.exe')).toBe(false);
    expect(isAllowedFile('data.csv')).toBe(false);
  });

  it('handles Windows-style separators', () => {
    expect(isAllowedFile('src\\util\\helpers.ts')).toBe(true);
    expect(isAllowedFile('node_modules\\dep\\index.js')).toBe(false);
  });
});

describe('walkRepo', () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'reposcribe-walk-'));
    const write = async (rel: string, body = 'x') => {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, body);
    };
    await write('src/index.ts', 'export const a = 1;');
    await write('README.md', '# hi');
    await write('config/data.json', '{}');
    await write('package-lock.json', '{}');
    await write('node_modules/dep/index.js', 'module.exports = 1;');
    await write('.git/config', '[core]');
    await write('assets/logo.png', 'PNG');
    await write('dist/bundle.js', 'bundle');
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns only the allow-listed, non-ignored files', async () => {
    const files = await walkRepo(root);
    const rels = files.map((f) => f.relPath).sort();
    expect(rels).toEqual(['README.md', 'config/data.json', 'src/index.ts']);
  });

  it('attaches absolute path and size to each file', async () => {
    const files = await walkRepo(root);
    for (const f of files) {
      expect(path.isAbsolute(f.absPath)).toBe(true);
      expect(f.size).toBeGreaterThan(0);
    }
  });
});
