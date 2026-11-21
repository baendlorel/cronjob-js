import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { Tag } from '../src/consts.js';
import { tryGlobSync } from '../src/utils.js';
import { createTestContext } from './helpers.js';

const makeTree = (files: string[]) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'crontab-js-glob-'));
  for (const f of files) {
    const abs = path.join(dir, f);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, '', 'utf8');
  }
  return dir;
};

describe('tryGlobSync — 返回绝对路径', () => {
  it('resolves hits against cx.dir', () => {
    const dir = makeTree(['a.js']);
    const { cx } = createTestContext({ dir });
    expect(tryGlobSync(cx)).toEqual([path.join(dir, 'a.js')]);
  });

  it('works when cx.dir is not process.cwd()', () => {
    const dir = makeTree(['a.js']);
    const { cx } = createTestContext({ dir });
    const [abs] = tryGlobSync(cx)!;
    expect(path.isAbsolute(abs)).toBe(true);
    expect(abs.startsWith(dir)).toBe(true);
  });

  it('keeps subdirectories in the result', () => {
    const dir = makeTree(['sub/deep/a.ts', 'b.js']);
    const { cx } = createTestContext({ dir });
    expect(tryGlobSync(cx)!.sort()).toEqual([path.join(dir, 'b.js'), path.join(dir, 'sub/deep/a.ts')]);
  });
});

describe('tryGlobSync — 过滤', () => {
  it('uses the default include: ts/js/sh only', () => {
    const dir = makeTree(['a.ts', 'b.js', 'c.sh', 'd.py', 'e.md', 'f.json']);
    const { cx } = createTestContext({ dir });
    expect(tryGlobSync(cx)!.map((p) => path.extname(p)).sort()).toEqual(['.js', '.sh', '.ts']);
  });

  it('honours the default excludes (node_modules, .git, .vscode, .claude, __pycache__)', () => {
    const dir = makeTree([
      'a.js',
      'node_modules/pkg/b.js',
      '.git/hooks/c.js',
      '.vscode/d.js',
      '.claude/e.js',
      '__pycache__/f.js',
    ]);
    const { cx } = createTestContext({ dir });
    expect(tryGlobSync(cx)).toEqual([path.join(dir, 'a.js')]);
  });

  it('accepts custom include / exclude', () => {
    const dir = makeTree(['a.js', 'b.ts', 'skip/a.js']);
    const { cx } = createTestContext({ dir, include: ['**/*.ts'], exclude: [] });
    expect(tryGlobSync(cx)).toEqual([path.join(dir, 'b.ts')]);
  });

  it('returns [] for a directory with no matches', () => {
    const dir = makeTree(['readme.md']);
    const { cx } = createTestContext({ dir });
    expect(tryGlobSync(cx)).toEqual([]);
  });
});

describe('tryGlobSync — 错误', () => {
  it('returns null and logs [ERROR] when glob throws', () => {
    const { cx, logs } = createTestContext({ dir: '/virtual/dir' });
    // 绕过 createContext 的类型校验：模拟运行期拿到的坏 pattern
    (cx as any).include = [42];
    expect(tryGlobSync(cx)).toBeNull();
    const err = logs.find((l) => l.tag === Tag.Error)!;
    expect(err.args[0]).toBe('Error while globbing scripts.');
    expect(err.args[1]).toBeInstanceOf(TypeError);
  });
});
