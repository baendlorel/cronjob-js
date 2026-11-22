import { chmodSync, mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { initialize } from '../src/initialize.js';
import { detectRuntime, type Runtime } from '../src/interpreter.js';
import { createTestContext } from './helpers.js';

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'cronjob-js-init-'));

/** 探测一次，所有用例共用（真实 PATH） */
const runtime: Runtime = detectRuntime();

describe('initialize', () => {
  it('creates dir and logDir when missing', async () => {
    const root = tempDir();
    const dir = path.join(root, 'jobs');
    const logDir = path.join(root, 'logs');

    const { cx } = createTestContext({ dir, logDir });
    await initialize(cx, runtime);

    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(logDir).isDirectory()).toBe(true);
  });

  it('does not fail when dir already exists (recursive mkdir)', async () => {
    const dir = tempDir();
    const { cx } = createTestContext({ dir });
    await expect(initialize(cx, runtime)).resolves.toBeUndefined();
  });

  it('creates new dirs with 0755 even under umask 002 (F44)', async () => {
    if (process.getuid?.() === 0) return; // root 不检查权限
    const root = tempDir();
    const dir = path.join(root, 'jobs');
    const logDir = path.join(root, 'logs');

    // Debian/Ubuntu 的 USERGROUPS_ENAB 下登录 shell 默认就是 002，pm2 会把它传给应用
    const oldUmask = process.umask(0o002);
    try {
      await initialize(createTestContext({ dir, logDir }).cx, runtime);
    } finally {
      process.umask(oldUmask);
    }

    expect(statSync(dir).mode & 0o777).toBe(0o755);
    expect(statSync(logDir).mode & 0o777).toBe(0o755);
  });

  it('does not create logDir twice when it equals dir', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'keep.txt'), 'x');
    const { cx } = createTestContext({ dir });
    await initialize(cx, runtime);
    expect(readdirSync(dir)).toEqual(['keep.txt']);
  });

  it('detects tsx / python availability and logs accordingly', async () => {
    const { cx, logs } = createTestContext({ dir: tempDir() });
    await initialize(cx, runtime);

    const { hasTsx, pythonCmd } = runtime;
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
    await initialize(createTestContext({ dir }).cx, runtime);

    const pending = initialize(createTestContext({ dir }).cx, runtime);
    await expect(pending).rejects.toThrow('cronjob-js already running');
  });

  it('uses different locks for different dirs', async () => {
    const a = tempDir();
    const b = tempDir();
    await expect(initialize(createTestContext({ dir: a }).cx, runtime)).resolves.toBeUndefined();
    await expect(initialize(createTestContext({ dir: b }).cx, runtime)).resolves.toBeUndefined();
  });

  it('treats relative / trailing-slash / symlink spellings of one dir as the same lock', async () => {
    const root = tempDir();
    const dir = path.join(root, 'jobs');
    mkdirSync(dir);
    const link = path.join(root, 'link');
    symlinkSync(dir, link, 'dir');
    await initialize(createTestContext({ dir }).cx, runtime);

    // 尾部斜杠：createContext 会先规范化
    await expect(initialize(createTestContext({ dir: dir + '/' }).cx, runtime)).rejects.toThrow('already running');
    // 相对路径：同一个绝对目录
    const relative = path.relative(process.cwd(), dir);
    await expect(initialize(createTestContext({ dir: relative }).cx, runtime)).rejects.toThrow('already running');
    // 符号链接：靠锁名里的 realpath 识别
    await expect(initialize(createTestContext({ dir: link }).cx, runtime)).rejects.toThrow('already running');
  });

  it('refuses a group/world-writable dir or logDir (F40)', async () => {
    if (process.getuid?.() === 0) return; // root 不检查
    const root = tempDir();
    const dir = path.join(root, 'jobs');
    const logDir = path.join(root, 'logs');
    mkdirSync(dir);
    mkdirSync(logDir);

    // 每次用独立的 logDir 才能绕过上一轮已经拿到的锁
    chmodSync(dir, 0o777);
    await expect(initialize(createTestContext({ dir, logDir }).cx, runtime)).rejects.toThrow('must be owned by the current user');

    // 锁在 acquireLock 里拿、失败也会留在进程里，所以每一轮换一个新的 logDir 来避开锁
    const logDir2 = path.join(root, 'logs2');
    mkdirSync(logDir2);
    chmodSync(dir, 0o755);
    chmodSync(logDir2, 0o775);
    await expect(initialize(createTestContext({ dir: path.join(root, 'jobs2'), logDir: logDir2 }).cx, runtime)).rejects.toThrow(
      'logDir must be owned by the current user',
    );

    const logDir3 = path.join(root, 'logs3');
    mkdirSync(logDir3);
    chmodSync(logDir3, 0o755);
    await expect(initialize(createTestContext({ dir: path.join(root, 'jobs3'), logDir: logDir3 }).cx, runtime)).resolves.toBeUndefined();
  });
});
