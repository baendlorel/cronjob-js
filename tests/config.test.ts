import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { Tag } from '../src/consts.js';
import { createContext } from '../src/context/index.js';

describe('createContext — 默认值', () => {
  it('applies documented defaults', () => {
    const cx = createContext({ dir: '/virtual/dir', write: () => {} });
    expect(cx).toMatchObject({
      dir: '/virtual/dir',
      logDir: '/virtual/dir',
      include: ['**/*.{ts,js,sh}'],
      exclude: [
        '**/node_modules/',
        '**/.git/',
        '**/.vscode/',
        '**/.claude/',
        '**/__pycache__/',
        '**/dist/',
        '**/dist-tsc/',
        '**/coverage/',
      ],
      timezone: 'Asia/Shanghai',
    });
    expect(cx.jobcwd('/virtual/dir/a.js')).toBe('/virtual/dir');
    expect(cx.timeFormat).toBeInstanceOf(Intl.DateTimeFormat);
  });

  it('defaults dir to process.cwd()', () => {
    expect(createContext().dir).toBe(process.cwd());
  });

  it('allows logDir to differ from dir', () => {
    const cx = createContext({ dir: '/virtual/dir', logDir: '/virtual/logs', write: () => {} });
    expect(cx.logDir).toBe('/virtual/logs');
  });

  it('wraps a string jobcwd into a function; keeps a function as is', () => {
    expect(createContext({ jobcwd: '/work', write: () => {} }).jobcwd('/x')).toBe('/work');

    const fn = (p: string) => `/work/${p}`;
    expect(createContext({ jobcwd: fn, write: () => {} }).jobcwd('/x')).toBe(fn('/x'));
  });

  it('normalizes dir and logDir to absolute paths', () => {
    // 单例锁的 key 直接取 cx.dir，不规范化会让 './g'、'/abs/g'、'/abs/g/' 变成三个不同目录
    const rel = createContext({ dir: './virtual/dir', logDir: './virtual/logs', write: () => {} });
    expect(rel.dir).toBe(path.resolve('./virtual/dir'));
    expect(rel.logDir).toBe(path.resolve('./virtual/logs'));
    expect(rel.jobcwd('/x')).toBe(path.resolve('./virtual/dir'));

    const trailing = createContext({ dir: '/virtual/dir/', write: () => {} });
    expect(trailing.dir).toBe('/virtual/dir');
    expect(trailing.logDir).toBe('/virtual/dir');
  });

  it('creates a formatter in the configured timezone', () => {
    const cx = createContext({ timezone: 'UTC', write: () => {} });
    expect(cx.timeFormat.format(new Date('2026-11-21T01:02:03.456Z'))).toBe('2026/11/21 01:02:03.456');
  });
});

describe('createContext — 校验', () => {
  it.each([
    ['dir', { dir: 1 }],
    ['logDir', { logDir: 1 }],
    ['jobcwd', { jobcwd: 1 }],
    ['write', { write: 1 }],
    ['include', { include: 'x' }],
    ['include', { include: [1] }],
    ['exclude', { exclude: 'x' }],
    ['exclude', { exclude: [1] }],
  ])('rejects a bad %s', (name, override) => {
    expect(() => createContext(override as any)).toThrow(TypeError);
    expect(() => createContext(override as any)).toThrow(name);
  });

  it('rejects an invalid timezone', () => {
    expect(() => createContext({ timezone: 'Mars/Olympus' })).toThrow(RangeError);
  });

  it('accepts undefined (no config at all)', () => {
    expect(() => createContext()).not.toThrow();
    expect(() => createContext(undefined)).not.toThrow();
  });
});

describe('cx.log', () => {
  it('maps every log method to its tag', () => {
    const calls: Array<{ tag: Tag; args: any[] }> = [];
    const cx = createContext({ dir: '/virtual/dir', write: (tag, ...args) => calls.push({ tag, args }) });

    cx.log.info('a');
    cx.log.warn('b');
    cx.log.err('c');
    cx.log.spawn('d');
    cx.log.exit('e');
    cx.log.debug('f');

    expect(calls).toEqual([
      { tag: Tag.Info, args: ['a'] },
      { tag: Tag.Warn, args: ['b'] },
      { tag: Tag.Error, args: ['c'] },
      { tag: Tag.Spawn, args: ['d'] },
      { tag: Tag.Exit, args: ['e'] },
      { tag: Tag.Debug, args: ['f'] },
    ]);
  });

  it('passes through multiple args, including Error objects', () => {
    const calls: any[][] = [];
    const cx = createContext({ dir: '/virtual/dir', write: (_tag, ...args) => calls.push(args) });
    const err = new Error('boom');
    cx.log.err('prefix', err);
    expect(calls[0]).toEqual(['prefix', err]);
  });
});
