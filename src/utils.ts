import type { CronjobContext } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

export const log = (cx: CronjobContext, ...args: any[]) => console.log(dtm(cx, new Date()), ...args);
export const dtm = (cx: CronjobContext, date: Date) => cx.timeFormat.format(date);

/**
 * 返回要处理的文件的绝对路径
 */
export const tryGlobSync = (cx: CronjobContext) => {
  try {
    return fs
      .globSync(cx.include, { cwd: cx.dir, exclude: cx.exclude })
      .map((v) => path.resolve(cx.dir, v));
  } catch (e) {
    log(cx, `Error while globbing scripts.`, e);
    return null;
  }
};
