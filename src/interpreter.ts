import type { Interpreter } from './types/global.js';
import { spawnSync } from 'node:child_process';

/**
 * 检测系统中可用的运行时命令。
 * @returns 可用的命令名，都不可用则返回 null
 */
export function detectCommand(cmd: string) {
  const result = spawnSync(cmd, ['--version'], {
    encoding: 'utf8',
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'ignore'], // 不关心 stderr 输出
  });

  // status === 0 表示命令存在且正常退出
  return result.status === 0 ? cmd : null;
}

// 增加一个尝试找到python运行时的脚本
export const CMD_NONE = 'none';

/**
 * 探测所有运行时，返回解释器映射表。
 */
export function detectRuntime() {
  const tsCmd = detectCommand('tsx') ?? detectCommand('ts-node') ?? process.execPath;
  const jsLike = (cmd: string): Interpreter => ({ cmd, args: [] });

  const interpreters: Record<string, Interpreter> = {
    '.ts': jsLike(tsCmd),
    '.mts': jsLike(tsCmd),
    '.cts': jsLike(tsCmd),
    '.js': jsLike(process.execPath),
    '.mjs': jsLike(process.execPath),
    '.cjs': jsLike(process.execPath),
    '.py': {
      cmd: detectCommand('python3') || detectCommand('python') || CMD_NONE,
      args: [],
    },
    '.sh': {
      cmd: detectCommand('bash') || 'sh',
      args: [],
    },
    none: {
      cmd: CMD_NONE,
      args: [],
    },
  };

  return {
    interpreters,
    hasTsx: tsCmd !== process.execPath,
    pythonCmd: interpreters['.py'].cmd,
  };
}

export type Runtime = ReturnType<typeof detectRuntime>;

/**
 * 由 cronjob() 在开始调度或 --list 之前调用 loadRuntime() 赋值，这里的调用方只有它，
 * 所以不需要 fallback，也不需要"没人探测就先探测一次"的兜底：
 * 以前那份只含 .js/.mjs/.cjs 的 fallback 会让 --list 把 .ts/.sh 显示成 none（F47）。
 */
let runtime!: Runtime;

/** cronjob() 启动时调用：探测一次并缓存 */
export function loadRuntime(): Runtime {
  runtime = detectRuntime();
  return runtime;
}

export function getDefaultInterpreter(ext: string): Interpreter {
  return runtime.interpreters[ext] || runtime.interpreters.none;
}
