import { describe, expect, it } from 'vitest';

import { getDefaultInterpreter, loadRuntime } from '../src/interpreter.js';

/**
 * 解释器映射不再在模块加载时探测（避免 import 阻塞），所以这里显式调 loadRuntime()
 * 模拟 cronjob() 的启动流程。不重新 mock spawnSync，只断言当前机器上能确定的部分：
 * - 机器上一定有 node（测试本身就在跑）
 * - bash/sh/python3 在不同环境不一定存在，用集合断言
 */
loadRuntime();

describe('getDefaultInterpreter', () => {
  it('.js 总是走当前 node', () => {
    expect(getDefaultInterpreter('.js')).toEqual({ cmd: process.execPath, args: [] });
  });

  it('.ts 走 tsx / ts-node / 当前 node 之一', () => {
    const { cmd, args } = getDefaultInterpreter('.ts');
    expect([process.execPath, 'tsx', 'ts-node']).toContain(cmd);
    expect(args).toEqual([]);
  });

  it('.mjs / .cjs 与 .js 一致，.mts / .cts 与 .ts 一致（F35）', () => {
    expect(getDefaultInterpreter('.mjs')).toEqual(getDefaultInterpreter('.js'));
    expect(getDefaultInterpreter('.cjs')).toEqual(getDefaultInterpreter('.js'));
    expect(getDefaultInterpreter('.mts')).toEqual(getDefaultInterpreter('.ts'));
    expect(getDefaultInterpreter('.cts')).toEqual(getDefaultInterpreter('.ts'));
  });

  it('.sh 走 bash 或 sh', () => {
    expect(['bash', 'sh']).toContain(getDefaultInterpreter('.sh').cmd);
  });

  it('.py 走 python3 / python / none', () => {
    expect(['python3', 'python', 'none']).toContain(getDefaultInterpreter('.py').cmd);
  });

  it('未知扩展返回 none，而不是 undefined', () => {
    expect(getDefaultInterpreter('.rb')).toEqual({ cmd: 'none', args: [] });
    expect(getDefaultInterpreter('')).toEqual({ cmd: 'none', args: [] });
    expect(getDefaultInterpreter('no-extension')).toEqual({ cmd: 'none', args: [] });
  });

  it('显式传入 none 也返回 none', () => {
    expect(getDefaultInterpreter('none').cmd).toBe('none');
  });

  it('每次返回同一个冻结之外的共享对象，不做防御性拷贝', () => {
    // 这里固定住现状：调用方不要就地修改返回对象
    expect(getDefaultInterpreter('.js')).toBe(getDefaultInterpreter('.js'));
  });
});
