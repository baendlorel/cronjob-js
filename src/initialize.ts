import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import net from 'node:net';

import { consts } from './consts.js';
import { log } from './utils.js';

export let hasTsx = true;

/**
 * 锁名跟着任务目录走，同一台机器跑多个项目时不会互相误伤。
 * \0 前缀 = 抽象 namespace，不落盘；进程退出（含 kill -9）由内核自动释放。
 */
const LOCK_NAME =
  '\0czdo-cronjob-runner-' +
  createHash('sha1').update(consts.定时任务位置).digest('hex').slice(0, 8);

/** 持有引用，防止 unref 后的 server 被 GC，导致锁被提前释放 */
let lock = null;

/**
 * 检查 tsx 是否可用；没有只警告，纯 js/sh 任务仍可运行
 */
const orTsx = () => {
  try {
    execFileSync(process.execPath, ['--import', 'tsx', '-e', '0'], { stdio: 'pipe' });
    hasTsx = true;
  } catch {
    hasTsx = false;
    log(
      '[Warn] tsx not available, .ts jobs will run by node directly, not all nodejs version and typescript syntax are supported, some may fail to start',
    );
  }
};

const ensureDir = () => {
  mkdirSync(consts.定时任务位置, { recursive: true });
  mkdirSync(consts.日志路径, { recursive: true });
};

const ensureTimezone = () => {
  const tz = consts.timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    log(`[Error] Invalid timezone: ${tz}`);
    process.exit(1);
  }
};

/**
 * 绑定成功则 resolve（进程活着就一直占着）；
 * 已被占用则 reject —— 不 process.exit，由宿主决定怎么退。
 * @returns {Promise<void>}
 */
const acquireLock = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (/** @type NodeJS.ErrnoException */ e) => {
      reject(e.code === 'EADDRINUSE' ? new Error('cronjob-runner already running') : e);
    });
    server.listen(LOCK_NAME, () => {
      server.unref(); // 不阻止进程退出
      lock = server;
      resolve();
    });
  });

export const initialize = async () => {
  // 先拿锁：重复实例不必再做后面的探测
  await acquireLock();
  ensureDir();
  orTsx();
  ensureTimezone();
};
