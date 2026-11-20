import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { log } from './utils.js';

/**
 * @typedef {Object} CronExpItem
 * @property {number}  group   分组编号，同一个分组只要一个匹配即可运行，只运行一次
 * @property {boolean} dev     是否开发模式
 * @property {string[]} tokens 字符段列表
 * @property {string}  exp     cron表达式
 */

/**
 * 判定本轮是否该运行
 *
 * @param {string} exp
 * @param {Date} now 本轮开始的时间
 * @returns {{ matched: boolean, next: Date }}
 */
export const matchTime = (exp, now) => {
  const opts = { timezone: consts.timezone, from: now };
  return {
    matched: isMatch(exp, now, opts),
    next: nextRun(exp, opts),
  };
};

/**
 * @deprecated 现在极简化处理，不再需要
 *
 * 旧的匹配方式，保留备查：判断 now 距离上次/下次是否在容差内。
 *
 * 缺点：容差只有 200ms，且基于 node-cron 恰好在 0 秒触发的假设，晚触发即漏跑。
 * @param {string} exp
 * @param {Date} now
 */
export const oldMatchTime = (exp, now) => {
  const res = {
    prev: previousRun(exp, { timezone: consts.timezone, from: now }),
    next: nextRun(exp, { timezone: consts.timezone, from: now }),
    matched: false,
  };
  res.matched = tolerant(now, res.prev) || tolerant(now, res.next);
  return res;
};

/**
 * 时间容差
 */
const tolerant = (time1, time2, threshold = consts.时间容差) => {
  return Math.abs(time1.getTime() - time2.getTime()) < threshold;
};
