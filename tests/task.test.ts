import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CronjobState } from '../src/consts.js';
import { runTask } from '../src/cron/task.js';
import { createTestContext } from './helpers.js';

/**
 * 上海 2026-11-21 12:00:30.500（周六）
 * fake timers 下 Date 也被接管，cron 匹配用哪个时区都无所谓 —— 这里只测调度节奏。
 */
const START = new Date('2026-11-21T12:00:30.500+08:00');
const START_MS = START.getTime();
const MINUTE = 60_000;

const setup = (fn = vi.fn()) => {
  const { cx, logs } = createTestContext();
  const task = runTask(cx, fn);
  return { cx, logs, task, fn };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runTask — 每分钟触发', () => {
  it('wakes at the next minute boundary, not after a fixed 60s', async () => {
    const { fn } = setup();

    await vi.advanceTimersByTimeAsync(29_000); // 12:00:59.5，还没到边界
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500); // 12:01:00.0
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('hands fn a minute-truncated date', async () => {
    const { fn } = setup();
    await vi.advanceTimersByTimeAsync(30_000);
    const arg = fn.mock.calls[0][0] as Date;
    expect(arg.getSeconds()).toBe(0);
    expect(arg.getMilliseconds()).toBe(0);
    // 12:00:30.500 + 29.5s = 12:01:00.000
    expect(arg.getTime()).toBe(START_MS + 29_500);
  });

  it('keeps ticking every minute', async () => {
    const { fn } = setup();
    await vi.advanceTimersByTimeAsync(MINUTE * 5);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('reschedules at the boundary when the timer fires slightly early', async () => {
    const { fn, cx } = setup();

    // 模拟 WSL 上定时器提前 400ms 触发：手动把 now 往回拨，再推进定时器
    vi.setSystemTime(START_MS + 29_600);
    await vi.advanceTimersByTimeAsync(30_000);

    // 仍然只是“到边界了才跑”，且下一轮重新对齐
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cx.jobTimer).not.toBeNull();
  });
});

describe('runTask — pause / resume / stop', () => {
  it('pause prevents fn from running but keeps the timer', async () => {
    const { task, fn, cx } = setup();
    task.pause();
    expect(cx.jobState).toBe(CronjobState.Paused);
    expect(cx.jobTimer).not.toBeNull();

    await vi.advanceTimersByTimeAsync(MINUTE * 3);
    expect(fn).not.toHaveBeenCalled();
  });

  it('keeps rescheduling while paused, so the process does not exit at the minute boundary', async () => {
    // 锁 server 是 unref 的，暂停期间若不再排定时器，事件循环就空了，进程会以 code 0 自行退出
    const { task, fn, cx } = setup();
    task.pause();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(MINUTE);
      expect(cx.jobTimer).not.toBeNull();
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it('resume after pause starts firing again', async () => {
    const { task, fn } = setup();
    task.pause();
    await vi.advanceTimersByTimeAsync(MINUTE);

    task.resume();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stop clears the pending timer and prevents future runs', async () => {
    const { task, fn, cx } = setup();
    task.stop();
    expect(cx.jobState).toBe(CronjobState.Stopped);
    expect(cx.jobTimer).toBeNull();

    await vi.advanceTimersByTimeAsync(MINUTE * 3);
    expect(fn).not.toHaveBeenCalled();
  });

  it('stop during a paused state is still final', async () => {
    const { task, fn, cx } = setup();
    task.pause();
    task.stop();

    task.resume(); // 对 Stopped 无效
    await vi.advanceTimersByTimeAsync(MINUTE * 2);
    expect(fn).not.toHaveBeenCalled();
    expect(cx.jobTimer).toBeNull();
  });

  it('is idempotent: stop / pause / resume can be called repeatedly', () => {
    const { task, cx } = setup();
    task.stop();
    task.stop();
    task.pause();
    expect(cx.jobState).toBe(CronjobState.Stopped);

    task.resume();
    task.resume();
    expect(cx.jobState).toBe(CronjobState.Stopped);
  });
});

describe('runTask — 错误隔离', () => {
  it('keeps scheduling after fn throws synchronously', async () => {
    const err = new Error('boom');
    const fn = vi.fn(() => {
      throw err;
    });
    const { logs } = setup(fn);

    await vi.advanceTimersByTimeAsync(MINUTE * 2);
    expect(fn).toHaveBeenCalledTimes(2);
    const errors = logs.filter((l) => l.args[0] === 'Task tick failed:');
    expect(errors).toHaveLength(2);
    expect(errors[0].args[1]).toBe(err);
  });

  it('keeps scheduling after fn rejects', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('async boom')));
    const { logs } = setup(fn as any);

    await vi.advanceTimersByTimeAsync(MINUTE * 2);
    expect(fn).toHaveBeenCalledTimes(2);

    // reject 的 catch 是微任务，让它跑完
    await vi.runAllTicks();
    const errors = logs.filter((l) => l.args[0] === 'Task tick failed:');
    expect(errors.length).toBe(2);
  });

  it('schedules the next tick before calling fn, so a hung fn cannot stop the chain', async () => {
    const fn = vi.fn(() => new Promise<void>(() => {})); // 永不 resolve
    const { fn: f, cx } = setup(fn as any);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(f).toHaveBeenCalledTimes(1);
    expect(cx.jobTimer).not.toBeNull();
  });
});
