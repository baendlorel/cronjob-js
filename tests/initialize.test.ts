import { mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { initialize } from '../src/initialize.js';
import { createTestContext } from './helpers.js';

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'cronjob-js-init-'));

describe('initialize', () => {
  it('creates dir and logDir when missing', async () => {
    const root = tempDir();
    const dir = path.join(root, 'jobs');
    const logDir = path.join(root, 'logs');

    const { cx } = createTestContext({ dir, logDir });
    await initialize(cx);

    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(logDir).isDirectory()).toBe(true);
  });

  it('does not fail when dir already exists (recursive mkdir)', async () => {
    const dir = tempDir();
    const { cx } = createTestContext({ dir });
    await expect(initialize(cx)).resolves.toBeUndefined();
  });

  it('does not create logDir twice when it equals dir', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'keep.txt'), 'x');
    const { cx } = createTestContext({ dir });
    await initialize(cx);
    expect(readdirSync(dir)).toEqual(['keep.txt']);
  });

  it('detects tsx / python availability and logs accordingly', async () => {
    const { cx, logs } = createTestContext({ dir: tempDir() });
    await initialize(cx);

    const { hasTsx, pythonCmd } = await import('../src/interpreter.js');
    const text = logs.map((l) => `${l.tag} ${l.args[0]}`).join('\n');

    // tsx 缺失才 WARN；存在时 initialize 不额外输出 tsx 相关日志
    if (hasTsx) {
      expect(text).not.toContain("'tsx' not found");
    } else {
      expect(text).toContain("[WARN] 'tsx' not found");
    }
    // python 探测总会输出一条
    expect(text).toMatch(pythonCmd === 'none' ? /\[WARN\] python not available/ : /\[INFO\] python available/);
  });

  it('keeps a lock so the same dir cannot initialize twice in one process', async () => {
    // 注意：同一进程内抽象 socket 不能被两次 listen 占用，第二次应 reject
    const dir = tempDir();
    await initialize(createTestContext({ dir }).cx);

    const pending = initialize(createTestContext({ dir }).cx);
    await expect(pending).rejects.toThrow('cronjob-runner already running');
  });

  it('uses different locks for different dirs', async () => {
    const a = tempDir();
    const b = tempDir();
    await expect(initialize(createTestContext({ dir: a }).cx)).resolves.toBeUndefined();
    await expect(initialize(createTestContext({ dir: b }).cx)).resolves.toBeUndefined();
  });

  it('treats relative / trailing-slash / symlink spellings of one dir as the same lock', async () => {
    const root = tempDir();
    const dir = path.join(root, 'jobs');
    mkdirSync(dir);
    const link = path.join(root, 'link');
    symlinkSync(dir, link, 'dir');
    await initialize(createTestContext({ dir }).cx);

    // 尾部斜杠：createContext 会先规范化
    await expect(initialize(createTestContext({ dir: dir + '/' }).cx)).rejects.toThrow('already running');
    // 相对路径：同一个绝对目录
    const relative = path.relative(process.cwd(), dir);
    await expect(initialize(createTestContext({ dir: relative }).cx)).rejects.toThrow('already running');
    // 符号链接：靠锁名里的 realpath 识别
    await expect(initialize(createTestContext({ dir: link }).cx)).rejects.toThrow('already running');
  });
});
