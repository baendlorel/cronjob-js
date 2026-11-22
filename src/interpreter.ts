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

export const hasTsx = tsCmd !== process.execPath;
export const pythonCmd = interpreters['.py'].cmd;

export function getDefaultInterpreter(ext: string) {
  return interpreters[ext] || interpreters.none;
}
