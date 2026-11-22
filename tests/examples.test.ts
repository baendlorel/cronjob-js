import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getJobItem } from '../src/syntax/extract.js';
import { run } from '../src/run.js';
import { createTestContext } from './helpers.js';

/**
 * 这一组不 mock 任何东西：直接拿 example/jobs 下的真实脚本跑一遍完整链路
 * glob → 读文件 → 解析头部 → 决定解释器。用来确认“示例脚本”和测试素材不会漂移。
 */
const JOBS = new URL('../example/jobs/', import.meta.url).pathname;

const waitFor = async (predicate: () => boolean, timeout = 10_000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timed out');
    }
    await new Promise((r) => setTimeout(r, 25));
  }
};


const parse = (rel: string) => {
  const { cx, logs } = createTestContext({ dir: JOBS });
  const filepath = JOBS + rel;
  const content = readFileSync(filepath, 'utf8');
  return { item: getJobItem(cx, filepath, content), logs };
};

describe('example/jobs — 解析结果', () => {
  it('every-minute.js：一条表达式，走 node', () => {
    const { item } = parse('every-minute.js');
    expect(item!.flatCronGroups.map((g) => g.cron.stringify())).toEqual(['* * * * *']);
    expect(item!.interpreter.cmd).toBe(process.execPath);
  });

  it('daily-report.js：块外两条各自独立（group 0）', () => {
    const { item } = parse('daily-report.js');
    expect(item!.flatCronGroups).toEqual([
      { cron: expect.anything(), group: 0 },
      { cron: expect.anything(), group: 0 },
    ]);
    expect(item!.flatCronGroups.map((g) => g.cron.stringify())).toEqual(['0 9 * * *', '30 18 * * 1-5']);
  });

  it('backup.sh：shebang 覆盖默认解释器', () => {
    const { item } = parse('backup.sh');
    expect(item!.interpreter).toEqual({ cmd: '/bin/bash', args: ['-e'] });
    expect(item!.flatCronGroups.map((g) => g.cron.stringify())).toEqual(['0 3 * * *']);
  });

  it('weekdays/standup.js：/** */ 注释块内的 @cronbegin 被识别，两条同组', () => {
    const { item } = parse('weekdays/standup.js');
    expect(item!.flatCronGroups.map((g) => [g.cron.stringify(), g.group])).toEqual([
      ['0 9 * * 1-5', 1],
      ['0 9 * * 6', 1],
    ]);
  });

  it('README.md 不会被当成脚本（没有表达式）', () => {
    const jobs = readdirSync(JOBS);
    expect(jobs).toContain('README.md');
    // .md 不在默认 include 里，这里只确认它确实不该被解析
    expect(parse('README.md').item).toBeNull();
  });
});

describe('example/jobs — 真实执行一次', () => {
  it('every-minute.js 的日志写进 <relpath>.log', async () => {
    const { cx } = createTestContext({ dir: JOBS });
    const filepath = JOBS + 'every-minute.js';
    // 不 mock spawn：这是真实子进程
    run(cx, { filepath, interpreter: { cmd: process.execPath, args: [] }, count: 1 });

    const logfile = JOBS + 'every-minute.js.log';
    await waitFor(() => existsSync(logfile) && readFileSync(logfile, 'utf8').includes('[every-minute]'));
    // 清理产出，避免污染 example 目录
    rmSync(logfile, { force: true });
  });
});
