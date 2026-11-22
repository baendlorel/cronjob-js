import type { CronjobContext, UserCronjobConfig } from '../types/config.js';
import type { Runtime } from './interpreter.js';
import { resolve } from 'node:path';

import { CronjobState } from '../consts.js';
import { detectRuntime } from './interpreter.js';
import { createLogger, defaultWrite } from './logger.js';

/** 默认值：只改一处，测试与 createContext 都从这里断言 */
export const DEFAULTS = {
  include: ['**/*.{ts,js,sh,cts,mts,cjs,mjs,py}'],
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
};

const createFormatter = (timezone: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
    timeZone: timezone,
  });

/**
 * 创建上下文：配置校验 + 默认值 + 格式化器 + logger + 运行时映射，一次给齐。
 * - `runtime` 由调用方传入时直接用（便于测试注入）；不传就现场探测一次
 * - 探测只查 PATH（见 interpreter.ts），不执行外部命令
 */
export function createContext(
  rawConfig?: Partial<UserCronjobConfig>,
  runtime: Runtime = detectRuntime(),
): CronjobContext {
  const {
    dir = process.cwd(),
    logDir = dir,
    jobcwd = dir,
    include = DEFAULTS.include,
    exclude = DEFAULTS.exclude,
    timezone = DEFAULTS.timezone,
    write,
  } = Object(rawConfig) as UserCronjobConfig;

  if (typeof dir !== 'string') {
    throw new TypeError('`dir` must be a string');
  }

  if (typeof logDir !== 'string') {
    throw new TypeError('`logDir` must be a string');
  }

  if (typeof jobcwd !== 'string' && typeof jobcwd !== 'function') {
    throw new TypeError('`jobcwd` must be a string or a function');
  }

  if (write !== undefined && typeof write !== 'function') {
    throw new TypeError('`write` must be a function');
  }

  // 用 Intl 构造一次来校验时区，非法时区会抛 RangeError
  new Intl.DateTimeFormat('en-US', { timeZone: timezone });

  if (!Array.isArray(include) || include.some((pattern) => typeof pattern !== 'string')) {
    throw new TypeError('`include` must be an array of strings');
  }
  if (!Array.isArray(exclude) || exclude.some((pattern) => typeof pattern !== 'string')) {
    throw new TypeError('`exclude` must be an array of strings');
  }

  // 统一成绝对路径：单例锁的 key、日志相对路径、glob 的 cwd 都依赖它。
  // 否则 './g'、'/abs/g'、'/abs/g/' 会被当成三个不同的任务目录。
  const absDir = resolve(dir);
  const absLogDir = resolve(logDir);

  const timeFormat = createFormatter(timezone);

  // jobcwd 是字符串时包装成函数；显式传入的（含默认的 dir）不额外改动
  const defaultJobcwd = typeof jobcwd !== 'function' && jobcwd === dir ? absDir : jobcwd;
  const jobcwdFn = typeof defaultJobcwd === 'function' ? defaultJobcwd : () => defaultJobcwd;

  const writer = write === undefined ? defaultWrite(timeFormat) : write;

  return {
    dir: absDir,
    logDir: absLogDir,
    jobcwd: jobcwdFn,
    include,
    exclude,
    timezone,
    timeFormat,
    runtime,
    jobState: CronjobState.Running,
    jobTimer: null,
    write: writer,
    log: createLogger(writer),
  };
}
