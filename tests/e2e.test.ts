import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tag } from '../src/consts.js';
import { cronjob } from '../src/index.js';

/** 上海时间 12:00:30.500，让首轮在 29.5s 后触发 */
const START = new Date('2026-11-21T12:00:30.500+08:00');

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'cronjob-js-e2e-'));

const writeJob = (dir: string, name: string, content: string) => {
  const p = path.join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
};

const logsOf = (logs: Array<{ tag: string; args: any[] }>) =>
  logs.map((l) => `${l.tag} ${l.args.map(String).join(' ')}`);

/** 真实 I/O 需要在真实定时器下轮询 —— 触发 tick 之后先 stop + useRealTimers */
const waitFor = async (predicate: () => boolean, timeout = 10_000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const tickAndSettle = async (minutes = 1) => {
  await vi.advanceTimersByTimeAsync(minutes * 60_000);
  // 让 taskFn 里的 await loadFiles 等微任务跑完
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cronjob — 端到端', () => {
  it('命中时 spawn 脚本，日志里能看到 SPAWN / EXIT，脚本日志落到 <relpath>.log', async () => {
    const dir = tempDir();
    writeJob(dir, 'hello.sh', '#!/bin/bash\n# @cron * * * * *\necho "hit $(date +%s)"\n');

    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({ dir, write: (tag, ...args) => logs.push({ tag, args }) });

    await tickAndSettle();
    task.stop();
    vi.useRealTimers();

    const jobLog = path.join(dir, 'hello.sh.log');
    await waitFor(() => existsSync(jobLog) && readFileSync(jobLog, 'utf8').includes('hit'));
    // [EXIT] 由子进程的 exit 事件触发，可能晚于脚本日志落盘
    await waitFor(() => logs.some((l) => l.tag === Tag.Exit));

    const text = logsOf(logs).join('\n');
    expect(text).toMatch(/\[SPAWN\] path=hello\.sh pid=\d+/);
    expect(text).toMatch(/\[EXIT\] path=hello\.sh pid=\d+ code=0 signal=null/);
    expect(text).toContain('[DEBUG] Start');
    expect(text).toContain('[DEBUG] Finished in');
  });

  it('不命中的脚本不会 spawn', async () => {
    const dir = tempDir();
    // 每天 03:00，当前是周六 12:00
    writeJob(dir, 'nightly.sh', '#!/bin/bash\n# @cron 0 3 * * *\necho nightly\n');

    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({ dir, write: (tag, ...args) => logs.push({ tag, args }) });

    await tickAndSettle();
    task.stop();
    vi.useRealTimers();

    expect(logsOf(logs).join('\n')).not.toContain('[SPAWN]');
  });

  it('同一分钟命中两条独立表达式时 spawn 两次', async () => {
    const dir = tempDir();
    writeJob(dir, 'twice.sh', '#!/bin/bash\n# @cron * * * * *\n# @cron * * * * *\necho twice\n');

    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({ dir, write: (tag, ...args) => logs.push({ tag, args }) });

    await tickAndSettle();
    task.stop();
    vi.useRealTimers();

    await waitFor(() => readFileSyncIfExists(path.join(dir, 'twice.sh.log')).split('\n').filter(Boolean).length >= 2);
    // 两个 [SPAWN] 是同步打的，日志先于子进程退出，必定已经到达
    expect(logs.filter((l) => l.tag === Tag.Spawn)).toHaveLength(2);
  });

  it('块内多条命中只 spawn 一次', async () => {
    const dir = tempDir();
    writeJob(
      dir,
      'once.sh',
      ['#!/bin/bash', '# @cronbegin', '# @cron * * * * *', '# @cron * * * * 6', '# @cronend', 'echo once'].join('\n'),
    );

    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({ dir, write: (tag, ...args) => logs.push({ tag, args }) });

    await tickAndSettle();
    task.stop();
    vi.useRealTimers();

    await waitFor(() => readFileSyncIfExists(path.join(dir, 'once.sh.log')).includes('once'));
    expect(logs.filter((l) => l.tag === Tag.Spawn)).toHaveLength(1);
  });

  it('没有脚本时记 [INFO] 且不报错', async () => {
    const dir = tempDir();
    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({ dir, write: (tag, ...args) => logs.push({ tag, args }) });

    await tickAndSettle();
    task.stop();
    vi.useRealTimers();

    const text = logsOf(logs).join('\n');
    expect(text).toContain('[INFO] No scripts found.');
    expect(logs.filter((l) => l.tag === Tag.Error)).toEqual([]);
  });

  it('头部不是注释的未知扩展在提取阶段就被跳过（不 spawn、不告警）', async () => {
    const dir = tempDir();
    writeJob(dir, 'job.rb', '# @cron * * * * *\nputs "hi"\n');

    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({
      dir,
      include: ['**/*.rb'],
      write: (tag, ...args) => logs.push({ tag, args }),
    });

    await tickAndSettle();
    task.stop();
    vi.useRealTimers();

    // .rb 没有 allowFn，整段头部都被视为正式代码，于是提取不到表达式
    expect(logs.filter((l) => l.tag === Tag.Spawn)).toEqual([]);
    expect(logs.filter((l) => l.tag === Tag.Warn)).toEqual([]);
    expect(existsSync(path.join(dir, 'job.rb.log'))).toBe(false);
  });

  it('spawn 失败时记 [ERROR]，并由下一分钟继续尝试', async () => {
    const dir = tempDir();
    // 用不存在的解释器
    writeJob(dir, 'bad.sh', '#!/definitely/not/here\n# @cron * * * * *\necho x\n');

    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({ dir, write: (tag, ...args) => logs.push({ tag, args }) });

    await tickAndSettle(2);
    task.stop();
    vi.useRealTimers();

    const errors = logs.filter((l) => l.tag === Tag.Error);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(String(errors[0].args[0])).toMatch(/^path=bad\.sh pid=(undefined|-1)$/);
  });

  it('暂停期间不开新任务，恢复后继续', async () => {
    const dir = tempDir();
    writeJob(dir, 'p.sh', '#!/bin/bash\n# @cron * * * * *\necho p\n');

    const logs: Array<{ tag: string; args: any[] }> = [];
    const task = await cronjob({ dir, write: (tag, ...args) => logs.push({ tag, args }) });

    task.pause();
    await tickAndSettle(2);
    expect(logs.filter((l) => l.tag === Tag.Spawn)).toHaveLength(0);

    task.resume();
    await tickAndSettle();
    task.stop();
    vi.useRealTimers();

    await waitFor(() => readFileSyncIfExists(path.join(dir, 'p.sh.log')).includes('p'));
    expect(logs.filter((l) => l.tag === Tag.Spawn).length).toBeGreaterThanOrEqual(1);
  });

  it('同一个 dir 只能启动一次', async () => {
    const dir = tempDir();
    const task = await cronjob({ dir, write: () => {} });

    await expect(cronjob({ dir, write: () => {} })).rejects.toThrow('cronjob-runner already running');

    task.stop();
    vi.useRealTimers();
  });
});

const readFileSyncIfExists = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
