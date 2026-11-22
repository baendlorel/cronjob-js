import type { CronGroupItem } from '../src/types/job.js';

import { describe, expect, it } from 'vitest';

import { parseExp } from '../src/cron/parse.js';
import { getMatchedJob, getJobs, loadFiles } from '../src/syntax/job.js';
import { MAX_HEADER } from '../src/syntax/header.js';
import { createTestContext, parseLines } from './helpers.js';

const { cx } = createTestContext({ timezone: 'Asia/Shanghai', dir: '/virtual/dir' });

/** 上海 2026-11-21 09:00（周六） */
const SAT_9 = new Date('2026-11-21T09:00:00+08:00');
/** 上海 2026-11-21 21:00 */
const SAT_21 = new Date('2026-11-21T21:00:00+08:00');
/** 上海 2026-11-23 10:00（周一，09:00 的表达式不命中） */
const MON_10 = new Date('2026-11-23T10:00:00+08:00');

const group = (exp: string, n: number): CronGroupItem => ({ cron: parseExp(cx, exp, '/virtual/dir/x.js')!, group: n });
const itemOf = (groups: CronGroupItem[], filepath = '/virtual/dir/x.js') => ({
  filepath,
  interpreter: { cmd: 'node', args: [] },
  flatCronGroups: groups,
});

describe('getMatchedJob — count 语义', () => {
  it('counts every matching group-0 line independently', () => {
    const item = itemOf([group('0 9 * * *', 0), group('0 21 * * *', 0), group('0 12 * * *', 0)]);
    expect(getMatchedJob(cx, item, SAT_9).count).toBe(1);
    expect(getMatchedJob(cx, item, SAT_21).count).toBe(1);
  });

  it('spawns twice when two independent lines match the same minute', () => {
    const item = itemOf([group('0 9 * * *', 0), group('0 9 * 11 *', 0)]);
    expect(getMatchedJob(cx, item, SAT_9).count).toBe(2);
  });

  it('counts a block at most once even if several lines match', () => {
    const item = itemOf([group('0 9 * * 1-5', 1), group('0 9 * * 6', 1), group('0 9 * * *', 1)]);
    expect(getMatchedJob(cx, item, SAT_9).count).toBe(1);
  });

  it('counts each distinct block separately', () => {
    const item = itemOf([group('0 9 * * *', 1), group('0 9 * * *', 2), group('0 9 * * *', 3)]);
    expect(getMatchedJob(cx, item, SAT_9).count).toBe(3);
  });

  it('adds block counts to independent line counts', () => {
    const item = itemOf([group('0 9 * * *', 0), group('0 9 * * *', 0), group('0 9 * * *', 1), group('0 9 * * *', 1)]);
    expect(getMatchedJob(cx, item, SAT_9).count).toBe(3);
  });

  it('returns 0 when nothing matches', () => {
    const item = itemOf([group('0 9 * * *', 0)]);
    expect(getMatchedJob(cx, item, MON_10).count).toBe(0);
    expect(getMatchedJob(cx, itemOf([]), MON_10).count).toBe(0);
  });

  it('carries filepath and interpreter through unchanged', () => {
    const item = itemOf([group('0 9 * * *', 0)], '/virtual/dir/a/b.sh');
    const job = getMatchedJob(cx, item, SAT_9);
    expect(job).toMatchObject({
      filepath: '/virtual/dir/a/b.sh',
      interpreter: { cmd: 'node', args: [] },
      count: 1,
    });
  });
});

describe('getJobs — 文件级组合', () => {
  const file = (filepath: string, content: string) => ({ filepath, content, error: null }) as const;

  it('只返回命中的文件，并带上 count', () => {
    const jobs = getJobs(
      cx,
      [file('/virtual/dir/a.js', '// @cron 0 9 * * *\n'), file('/virtual/dir/b.js', '// @cron 0 12 * * *\n')],
      SAT_9,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ filepath: '/virtual/dir/a.js', count: 1 });
  });

  it('把多条独立命中的 count 汇总到同一个文件', () => {
    const jobs = getJobs(cx, [file('/virtual/dir/a.js', '// @cron 0 9 * * *\n// @cron * * 21 * *\n')], SAT_9);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].count).toBe(2);
  });

  it('块内多条命中只算一次', () => {
    const content = ['// @cronbegin', '// @cron 0 9 * * *', '// @cron 0 9 * * 6', '// @cronend'].join('\n');
    const jobs = getJobs(cx, [file('/virtual/dir/a.js', content)], SAT_9);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].count).toBe(1);
  });

  it('跳过没有表达式和语法错误的文件', () => {
    const jobs = getJobs(
      cx,
      [
        file('/virtual/dir/none.js', '// no cron here\nconsole.log(1)\n'),
        file('/virtual/dir/broken.js', '// @cronbegin\n// @cron 0 9 * * *\n'),
        file('/virtual/dir/ok.js', '// @cron 0 9 * * *\n'),
      ],
      SAT_9,
    );
    expect(jobs.map((j) => j.filepath)).toEqual(['/virtual/dir/ok.js']);
  });

  it('记录读取失败的文件但不中断整轮', () => {
    const { cx: local, logs } = createTestContext({ timezone: 'Asia/Shanghai', dir: '/virtual/dir' });
    const jobs = getJobs(
      local,
      [
        { filepath: '/virtual/dir/gone.js', content: null, error: new Error('ENOENT') },
        file('/virtual/dir/ok.js', '// @cron 0 9 * * *\n'),
      ],
      SAT_9,
    );
    expect(jobs.map((j) => j.filepath)).toEqual(['/virtual/dir/ok.js']);
    expect(logs.some((l) => String(l.args[0]).includes('Error loading file gone.js'))).toBe(true);
  });
});

describe('loadFiles', () => {
  it('把成功和失败都包成结果，不抛出', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const dir = await mkdtemp(path.join(tmpdir(), 'cronjob-js-load-'));
    const okPath = path.join(dir, 'ok.js');
    const missingPath = path.join(dir, 'missing.js');
    await writeFile(okPath, '// @cron * * * * *\n', 'utf8');

    const result = await loadFiles(cx, [okPath, missingPath]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ filepath: okPath, content: '// @cron * * * * *\n', error: null });
    expect(result[1].content).toBeNull();
    expect(result[1].error).toBeInstanceOf(Error);
  });

  it('跨过 CHUNK_SIZE 仍然保持顺序', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const dir = await mkdtemp(path.join(tmpdir(), 'cronjob-js-load-'));
    const paths = Array.from({ length: 205 }, (_, i) => path.join(dir, `f${i}.js`));
    await Promise.all(paths.map((p, i) => writeFile(p, String(i), 'utf8')));

    const result = await loadFiles(cx, paths);
    expect(result.map((r) => r.content)).toEqual(paths.map((_, i) => String(i)));
  });

  it('跳过 FIFO 等非普通文件，不会把线程池卡住（F30）', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { execFileSync } = await import('node:child_process');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const dir = await mkdtemp(path.join(tmpdir(), 'cronjob-js-fifo-'));
    const fifo = path.join(dir, 'pipe.js');
    const okPath = path.join(dir, 'real.js');
    execFileSync('mkfifo', [fifo]);
    await writeFile(okPath, '// @cron * * * * *\n', 'utf8');

    const { cx: local, logs } = createTestContext({ dir });

    // 有 FIFO 在场时，整轮必须能结束；旧实现会在这里永久挂起
    const result = await loadFiles(local, [fifo, okPath]);
    expect(result.map((r) => r.content)).toEqual([null, '// @cron * * * * *\n']);
    expect(logs.some((l) => String(l.args[0]).includes('Skipped non-regular file: pipe.js'))).toBe(true);
  });

  it('超过 MAX_HEADER 的大文件只读前 64KB（F31）', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const dir = await mkdtemp(path.join(tmpdir(), 'cronjob-js-big-'));
    const bigPath = path.join(dir, 'bundle.js');
    const body = `console.log("${'x'.repeat(90)}");\n`.repeat(5000);
    await writeFile(bigPath, `// @cron * * * * *\n${body}`, 'utf8');

    const [file] = await loadFiles(cx, [bigPath]);
    expect(file.content!.length).toBe(MAX_HEADER);
    // 头部仍能正常解析出表达式
    expect(getJobs(cx, [file], SAT_9).map((j) => j.filepath)).toEqual([bigPath]);
  });
});

// 只在这里用一下 parseLines，确认它和 getJobs 对同一份文本给出一致结果
it('parseLines matches the split+trim used by getJobs', () => {
  expect(parseLines('  // @cron 0 9 * * *\n\nx')).toEqual(['// @cron 0 9 * * *', '', 'x']);
});
