import type { CronjobContext } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 返回要处理的文件的绝对路径
 */
export const tryGlobSync = (cx: CronjobContext) => {
  try {
    return fs.globSync(cx.include, { cwd: cx.dir, exclude: cx.exclude }).map((v) => path.resolve(cx.dir, v));
  } catch (e) {
    cx.log.err(`Error while globbing scripts.`, e);
    return null;
  }
};
