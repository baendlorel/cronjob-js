import { describe, expect, it } from 'vitest';

import { detectCommand, detectRuntime, getDefaultInterpreter, type Runtime } from '../src/context/interpreter.js';

/**
 * 解释器映射由 createContext 在创建 cx 时探测一次（只查 PATH，不执行外部命令）。
 * 不 mock PATH，只断言当前机器上能确定的部分：
 * - 机器上一定有 node（测试本身就在跑）
 * - bash/sh/python3 在不同环境不一定存在，用集合断言
 */
const runtime: Runtime = detectRuntime();

const interp = (ext: string) => getDefaultInterpreter(runtime, ext);

describe('getDefaultInterpreter', () => {
  it('.js 总是走当前 node', () => {
    expect(interp('.js')).toEqual({ cmd: process.execPath, args: [] });
  });

  it('.ts 走 tsx / ts-node / 当前 node 之一', () => {
    const { cmd, args } = interp('.ts');
    expect([process.execPath, 'tsx', 'ts-node']).toContain(cmd);
    expect(args).toEqual([]);
  });

  it('.mjs / .cjs 与 .js 一致，.mts / .cts 与 .ts 一致（F35）', () => {
    expect(interp('.mjs')).toEqual(interp('.js'));
    expect(interp('.cjs')).toEqual(interp('.js'));
    expect(interp('.mts')).toEqual(interp('.ts'));
    expect(interp('.cts')).toEqual(interp('.ts'));
  });

  it('.sh 走 bash 或 sh', () => {
    expect(['bash', 'sh']).toContain(interp('.sh').cmd);
  });

  it('.py 走 python3 / python / none', () => {
    expect(['python3', 'python', 'none']).toContain(interp('.py').cmd);
  });

  it('未知扩展返回 none，而不是 undefined', () => {
    expect(interp('.rb')).toEqual({ cmd: 'none', args: [] });
    expect(interp('')).toEqual({ cmd: 'none', args: [] });
    expect(interp('no-extension')).toEqual({ cmd: 'none', args: [] });
  });

  it('显式传入 none 也返回 none', () => {
    expect(interp('none').cmd).toBe('none');
  });

  it('每次返回同一个冻结之外的共享对象，不做防御性拷贝', () => {
    // 这里固定住现状：调用方不要就地修改返回对象
    expect(interp('.js')).toBe(interp('.js'));
  });
});

describe('detectCommand', () => {
  it('找到 PATH 里的命令时返回命令名本身', () => {
    expect(detectCommand('bash')).toBe('bash');
  });

  it('PATH 里没有的命令返回 null', () => {
    expect(detectCommand('definitely-not-a-real-command-xyz')).toBeNull();
  });

  it('含路径的命令不查 PATH，直接看文件是否存在', () => {
    expect(detectCommand(process.execPath)).toBe(process.execPath);
    expect(detectCommand('/no/such/binary')).toBeNull();
  });
});
