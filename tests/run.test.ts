import type { CronjobContext } from '../src/types/config.js';
import type { Job } from '../src/types/global.js';

import { EventEmitter } from 'node:events';
import { existsSync, fstatSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Tag } from '../src/consts.js';

// 必须在 import 被测模块之前安装，run.ts 拿到的才是假 spawn
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});

const { spawn } = await import('node:child_process');
const { run } = await import('../src/run.js');

const spawnMock = vi.mocked(spawn);

/** 足够像 ChildProcess 的假进程：由测试 emit 事件来驱动 run() 的回调 */
class FakeChild extends EventEmitter {
  unrefCalls = 0;
  constructor(public pid: number | undefined) {
    super();
  }
  unref() {
    this.unrefCalls++;
    return this;
  }
}

interface Harness {
  cx: CronjobContext;
  logs: Array<{ tag: string; args: any[] }>;
  dir: string;
  relpath: string;
  filepath: string;
  logfile: string;
  child: FakeChild;
  job: Job;
}

const makeHarness = (opts: { ext?: string; pid?: number; cmd?: string } = {}): Harness => {
  const ext = opts.ext ?? '.js';
  const dir = mkdtempSync(path.join(tmpdir(), 'cronjob-js-run-'));
  const relpath = path.join('sub', `job${ext}`);
  const filepath = path.join(dir, relpath);
  mkdirSync(path.dirname(filepath), { recursive: true });
  writeFileSync(filepath, '// @cron * * * * *\n', 'utf8');

  const logs: Array<{ tag: string; args: any[] }> = [];
  const record =
    (tag: string) =>
    (...args: any[]) =>
      logs.push({ tag, args });
  const cx = {
    dir,
    logDir: dir,
    jobcwd: () => dir,
    log: {
      info: record(Tag.Info),
      err: record(Tag.Error),
      warn: record(Tag.Warn),
      spawn: record(Tag.Spawn),
      exit: record(Tag.Exit),
      debug: record(Tag.Debug),
    },
  } as unknown as CronjobContext;

  const child = new FakeChild(opts.pid === undefined && 'pid' in opts ? undefined : (opts.pid ?? 4321));
  spawnMock.mockReturnValue(child as any);

  return {
    cx,
    logs,
    dir,
    relpath,
    filepath,
    logfile: path.join(dir, relpath + '.log'),
    child,
    job: { filepath, interpreter: { cmd: opts.cmd ?? 'node', args: [] }, count: 1 },
  };
};

/** 对已关闭 fd 调 fstatSync 会抛 EBADF */
const isClosed = (fd: number) => {
  try {
    fstatSync(fd);
    return false;
  } catch {
    return true;
  }
};

const fdOf = (_h: Harness) => (spawnMock.mock.calls[0][2]!.stdio as unknown[])[1] as number;
const messages = (h: Harness, tag: string) => h.logs.filter((l) => l.tag === tag).map((l) => l.args[0]);

beforeEach(() => {
  spawnMock.mockReset();
});

describe('run — spawn 参数', () => {
  it('spawns the interpreter with the absolute script path', () => {
    const h = makeHarness();
    run(h.cx, h.job);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, options] = spawnMock.mock.calls[0];
    expect(cmd).toBe('node');
    expect(args).toEqual([h.filepath]);
    expect(options).toMatchObject({
      detached: true,
      cwd: h.dir,
      stdio: ['ignore', expect.any(Number), expect.any(Number)],
    });
  });

  it('puts interpreter args before the script path', () => {
    const h = makeHarness();
    run(h.cx, { ...h.job, interpreter: { cmd: 'bash', args: ['-e', '-u'] } });
    expect(spawnMock.mock.calls[0][1]).toEqual(['-e', '-u', h.filepath]);
  });

  it('uses jobcwd(filepath) as the child cwd', () => {
    const h = makeHarness();
    const jobcwd = vi.fn(() => '/some/where');
    run({ ...h.cx, jobcwd }, h.job);
    expect(jobcwd).toHaveBeenCalledWith(h.filepath);
    expect(spawnMock.mock.calls[0][2]).toMatchObject({ cwd: '/some/where' });
  });

  it('unrefs the child so the runner can exit', () => {
    const h = makeHarness();
    run(h.cx, h.job);
    expect(h.child.unrefCalls).toBe(1);
  });
});

describe('run — 日志文件', () => {
  it('redirects stdout/stderr to <logDir>/<relpath>.log and creates its directory', () => {
    const h = makeHarness();
    run(h.cx, h.job);
    expect(existsSync(h.logfile)).toBe(true);
  });

  it('keeps the log fd open until the child spawns, then closes it', () => {
    const h = makeHarness();
    run(h.cx, h.job);
    const fd = fdOf(h);
    expect(isClosed(fd)).toBe(false);
    h.child.emit('spawn');
    expect(isClosed(fd)).toBe(true);
  });

  it('closes the fd once even if both spawn and exit fire', () => {
    const h = makeHarness();
    run(h.cx, h.job);
    const fd = fdOf(h);
    h.child.emit('spawn');
    h.child.emit('exit', 0, null);
    // closeOutput 里把 output 置空，第二次 closeSync 不会发生
    expect(isClosed(fd)).toBe(true);
  });

  it('closes the fd when spawn throws synchronously', () => {
    const h = makeHarness();
    let opened: number | null = null;
    spawnMock.mockImplementation((_cmd, _args, options) => {
      opened = (options!.stdio as unknown[])[1] as number;
      throw new Error('spawn failed');
    });
    run(h.cx, h.job);
    expect(isClosed(opened!)).toBe(true);
  });
});

describe('run — 生命周期日志', () => {
  it('logs [SPAWN] with a path relative to dir', () => {
    const h = makeHarness();
    run(h.cx, h.job);
    h.child.emit('spawn');
    expect(messages(h, Tag.Spawn)).toEqual([`path=${h.relpath} pid=4321`]);
  });

  it('logs [EXIT] with code and signal', () => {
    const h = makeHarness();
    run(h.cx, h.job);
    h.child.emit('exit', 0, null);
    h.child.emit('exit', 1, 'SIGTERM');
    expect(messages(h, Tag.Exit)).toEqual([
      `path=${h.relpath} pid=4321 code=0 signal=null`,
      `path=${h.relpath} pid=4321 code=1 signal=SIGTERM`,
    ]);
  });

  it('logs [ERROR] with pid -1 for a child without pid', () => {
    const h = makeHarness({ pid: undefined });
    run(h.cx, h.job);
    h.child.emit('error', new Error('ENOENT'));
    expect(messages(h, Tag.Error)).toEqual([`path=${h.relpath} pid=-1`]);
    expect((h.logs.find((l) => l.tag === Tag.Error)!.args[1] as Error).message).toBe('ENOENT');
  });

  it('logs nothing before the child reports back', () => {
    const h = makeHarness();
    run(h.cx, h.job);
    expect(messages(h, Tag.Spawn)).toEqual([]);
    expect(messages(h, Tag.Exit)).toEqual([]);
    expect(messages(h, Tag.Error)).toEqual([]);
  });
});

describe('run — 异常路径', () => {
  it('warns and does not spawn for an unsupported interpreter', () => {
    const h = makeHarness({ ext: '.rb' });
    run(h.cx, { ...h.job, interpreter: { cmd: 'none', args: [] } });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(messages(h, Tag.Warn)[0]).toContain('unsupported extension');
  });

  it('logs an [ERROR] with pid=-1 when spawn throws synchronously', () => {
    const h = makeHarness();
    spawnMock.mockImplementation(() => {
      throw new Error('spawn failed');
    });
    expect(() => run(h.cx, h.job)).not.toThrow();
    const err = h.logs.find((l) => l.tag === Tag.Error)!;
    expect(err.args[0]).toBe(`path=${h.relpath} pid=-1`);
    expect((err.args[1] as Error).message).toBe('spawn failed');
  });

  it('logs an [ERROR] with pid=-1 when jobcwd throws', () => {
    const h = makeHarness();
    run(
      {
        ...h.cx,
        jobcwd: () => {
          throw new Error('bad cwd');
        },
      },
      h.job,
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(messages(h, Tag.Error)).toEqual([`path=${h.relpath} pid=-1`]);
  });

  it('logs an [ERROR] with pid=-1 when the log directory cannot be created', () => {
    const h = makeHarness();
    // logDir 落在一个普通文件下面，mkdirSync 会 ENOTDIR
    const blocker = path.join(h.dir, 'blocker');
    writeFileSync(blocker, '');
    run({ ...h.cx, logDir: path.join(blocker, 'logs') }, h.job);
    expect(spawnMock).not.toHaveBeenCalled();
    const err = h.logs.find((l) => l.tag === Tag.Error)!;
    expect(err.args[0]).toBe(`path=${h.relpath} pid=-1`);
    expect(err.args[1]).toMatchObject({ code: 'ENOTDIR' });
  });
});
