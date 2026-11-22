import { describe, expect, it, vi } from 'vitest';

import { list } from '../src/list.js';
import { createTestContext } from './helpers.js';

/**
 * list 用 console.log 输出表格（不走 cx.log），这里把它接住。
 * - createTestContext 会在创建 cx 时一并探测运行时（cx.runtime），
 *   list 里的解释器列才与实际调度一致（F47）
 */
const capture = async (dir: string, timezone = 'Asia/Shanghai') => {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    lines.push(args.join(' '));
  });
  try {
    const { cx, logs } = createTestContext({ dir, timezone });
    await list(cx);
    return { lines, logs, cx };
  } finally {
    spy.mockRestore();
  }
};


const JOBS = new URL('../example/jobs/', import.meta.url).pathname;

describe('list', () => {
  it('每个表达式输出一行，并带上下一次运行时间、相对路径和命令', async () => {
    const { lines } = await capture(JOBS);

    expect(lines).toHaveLength(6); // every-minute 1 + daily-report 2 + backup 1 + standup 2

    const report = lines.filter((l) => l.includes('daily-report.js'));
    expect(report).toHaveLength(2);
    expect(report[0]).toMatch(/^\S+ \S+ *0 9 \* \* \*\s+daily-report\.js\s+/);
    expect(report[1]).toContain('30 18 * * 1-5');

    const backup = lines.find((l) => l.includes('backup.sh'))!;
    expect(backup).toMatch(/\b0 3 \* \* \*\s+backup\.sh\s+\/bin\/bash -e /);
  });

  it('解释器列是探测后的真实命令，不是 none（F47）', async () => {
    const { lines } = await capture(JOBS);
    // 以前 --list 在探测之前就退出，.sh / .ts 会显示成 "none"
    expect(lines.every((l) => !l.includes(' none '))).toBe(true);
    expect(lines.find((l) => l.includes('backup.sh'))).toMatch(/\/(bin\/)?bash -e/);
  });

  it('块内表达式缩进并标出 group', async () => {
    const { lines } = await capture(JOBS);
    const standup = lines.find((l) => l.includes('standup.js'))!;
    expect(standup).toContain('  [1] ');
    expect(standup).toContain('0 9 * * 1-5');
  });

  it('相对路径保留子目录', async () => {
    const { lines } = await capture(JOBS);
    expect(lines.find((l) => l.includes('standup.js'))).toContain('weekdays/standup.js');
  });

  it('没有脚本时输出提示而不是空表', async () => {
    const { lines, logs } = await capture(JOBS + 'does-not-exist/');
    expect(lines).toEqual([]);
    expect(logs.map((l) => l.args[0]).join('\n')).toContain('No scripts found');
  });
});

describe('list — 表达式展示', () => {
  it('每条表达式重新 parse，next() 不会因共享游标而前进', async () => {
    const { lines } = await capture(JOBS);
    const every = lines.find((l) => l.includes('every-minute.js'))!;
    // * * * * * 的“下一次”永远是下一分钟；如果 next() 被共享游标推进，
    // 这里就会变成两分钟后 —— 上海时间与测试进程本地时间不同时区也成立
    expect(every.slice(0, 24).trim()).toContain(':00.000');
    const shanghaiNow = every.slice(0, 24).trim().slice(0, 10);
    expect(shanghaiNow).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

});
