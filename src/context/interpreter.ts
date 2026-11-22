import type { Interpreter } from '../types/global.js';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { env } from 'node:process';

const isPath = (cmd: string) => cmd.includes('/') || cmd.includes('\\');

/**
 * 检测系统中可用的运行时命令。
 * - 只查 PATH、不执行命令：`tsx --version` 实测约 740ms，而探测在 cronjob() 的启动路径上，
 *   每个 cx 都要付一次太贵。代价是"存在但跑不起来"的命令会被当成可用，启动时不会发现。
 * - 含路径分隔符的命令直接看文件是否存在，不查 PATH
 * - PATH 为空时（某些 pm2 配置）回退到常见系统目录
 * @returns 可用的命令名，都不可用则返回 null
 */
export function detectCommand(cmd: string): string | null {
  if (isPath(cmd)) {
    return existsSync(cmd) ? cmd : null;
  }
  for (const dir of (env.PATH || '/usr/local/bin:/usr/bin:/bin').split(delimiter)) {
    if (dir && existsSync(join(dir, cmd))) {
      return cmd;
    }
  }
  return null;
}

/** 标记"没有可用解释器"的占位命令，run() 见到它只记 WARN 不 spawn */
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

/** 取扩展名对应的解释器；没有映射的（或映射成 none）交给 run() 记 WARN */
export function getDefaultInterpreter(runtime: Runtime, ext: string): Interpreter {
  return runtime.interpreters[ext] || runtime.interpreters.none;
}
