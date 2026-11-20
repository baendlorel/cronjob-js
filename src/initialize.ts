import type { CronjobConfig } from './config.js';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import net from 'node:net';

import { log } from './utils.js';
import { pythonCmd, hasTsx } from './interpreter.js';

/** 持有引用，防止 unref 后的 server 被 GC，导致锁被提前释放 */
let lock: net.Server | null = null;

/**
 * 检查 tsx 是否可用；没有只警告，纯 js/sh 任务仍可运行
 */
const orTsx = () => {
  if (!hasTsx) {
    log(`[Warn] 'tsx' not found, .ts files will be run by node directly. Not all nodejs versions supports this.`);
  }
};

const orPython = () => {
  if (pythonCmd) {
    log(`[Info] python available, .py files will be run by ${pythonCmd}`);
  } else {
    log('[Warn] python not available, .py jobs will be ignored');
  }
};

const ensureDir = (config: CronjobConfig) => {
  mkdirSync(config.dir, { recursive: true });
  if (config.dir !== config.logDir) {
    mkdirSync(config.logDir, { recursive: true });
  }
};

/**
 * 绑定成功则 resolve（进程活着就一直占着）；
 * 已被占用则 reject —— 不 process.exit，由宿主决定怎么退。
 * @returns {Promise<void>}
 */
const acquireLock = (config: CronjobConfig) =>
  new Promise<void>((resolve, reject) => {
    /**
     * 锁名跟着任务目录走，同一台机器跑多个项目时不会互相误伤。
     * \0 前缀 = 抽象 namespace，不落盘；进程退出（含 kill -9）由内核自动释放。
     */
    const LOCK_NAME = '\0czdo-cronjob-runner-' + createHash('sha1').update(config.dir).digest('hex').slice(0, 8);
    const server = net.createServer();
    server.once('error', (e: NodeJS.ErrnoException) => {
      reject(e.code === 'EADDRINUSE' ? new Error('cronjob-runner already running') : e);
    });
    server.listen(LOCK_NAME, () => {
      server.unref(); // 不阻止进程退出
      lock = server;
      resolve();
    });
  });

export const initialize = async (config: CronjobConfig) => {
  // 先拿锁：重复实例不必再做后面的探测
  await acquireLock(config);
  ensureDir(config);
  orTsx();
  orPython();
};
