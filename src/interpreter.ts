import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';

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

export interface Interpreter {
  cmd: string;
  args: string[];
}

// 增加一个尝试找到python运行时的脚本

const interpreters: Record<string, Interpreter> = {
  '.ts': {
    cmd: process.execPath,
    args: detectCommand('tsx') ? ['--import', 'tsx'] : [],
  },
  '.js': {
    cmd: process.execPath,
    args: [],
  },
  '.py': {
    cmd: detectCommand('python3') || detectCommand('python') || 'none',
    args: [],
  },
  '.sh': {
    cmd: detectCommand('bash') || 'sh',
    args: [],
  },
};

export const hasTsx = interpreters['.ts'].args.length > 0;
export const pythonCmd = interpreters['.py'].cmd;

export function getDefaultInterpreter(ext: string) {
  return interpreters[ext] || interpreters['.js'];
}
