import type { CronjobContext } from './types/config.js';
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

/**
 * 用来解决超时问题
 * - 不一定用得上
 */
export function nolater<T extends Promise<any>>(cx: CronjobContext, promise: T, ms: number = 2000): T {
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`Promise did not resolve within ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]) as T;
}
