import type { CronjobContext } from './config.js';
import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';

import { CMD_NONE, pythonCmd, hasTsx } from './interpreter.js';

/** 持有引用，防止 unref 后的 server 被 GC，导致锁被提前释放 */
let lock: net.Server | null = null;

/**
 * 检查 tsx 是否可用；没有只警告，纯 js/sh 任务仍可运行
 */
const orTsx = (cx: CronjobContext) => {
  if (!hasTsx) {
    cx.log.warn(`'tsx' not found, .ts files will be run by node directly. Not all nodejs versions supports this.`);
  }
};

const orPython = (cx: CronjobContext) => {
  if (pythonCmd !== CMD_NONE) {
    cx.log.info(`python available, .py files will be run by ${pythonCmd}`);
  } else {
    cx.log.warn('python not available, .py jobs will be ignored');
  }
};

const ensureDir = (cx: CronjobContext) => {
  mkdirSync(cx.dir, { recursive: true });
  if (cx.dir !== cx.logDir) {
    mkdirSync(cx.logDir, { recursive: true });
  }
};

/**
 * 锁名用的目录标识：realpath 兜住符号链接（/a/link 与 /b/real 是同一个目录时也能识别），
 * 目录还不存在时退回 resolve 的结果（ensureDir 在拿锁之后才建目录）。
 */
const lockKeyOf = (dir: string) => {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
};

/**
 * 绑定成功则 resolve（进程活着就一直占着）；
 * 已被占用则 reject —— 不 process.exit，由宿主决定怎么退。
 * @returns {Promise<void>}
 */
const acquireLock = (cx: CronjobContext) =>
  new Promise<void>((resolve, reject) => {
    /**
     * 锁名跟着任务目录走，同一台机器跑多个项目时不会互相误伤。
     * \0 前缀 = 抽象 namespace，不落盘；进程退出（含 kill -9）由内核自动释放。
     * exclusive: true —— cluster 模式下 listen 默认交给 primary 代绑并共享句柄，
     * 每个 worker 都会"成功"，锁就失效了；exclusive 让每个 worker 自己真绑，第二个拿到 EADDRINUSE。
     */
    const LOCK_NAME = '\0cronjob-js-' + createHash('sha1').update(lockKeyOf(cx.dir)).digest('hex').slice(0, 8);
    const server = net.createServer();
    server.once('error', (e: NodeJS.ErrnoException) => {
      reject(e.code === 'EADDRINUSE' ? new Error('cronjob-js already running') : e);
    });
    server.listen({ path: LOCK_NAME, exclusive: true }, () => {
      server.unref(); // 不阻止进程退出
      lock = server;
      resolve();
    });
  });

export const initialize = async (cx: CronjobContext) => {
  // 先拿锁：重复实例不必再做后面的探测
  await acquireLock(cx);
  ensureDir(cx);
  orTsx(cx);
  orPython(cx);
};
