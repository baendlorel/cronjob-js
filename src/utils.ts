import type { CronjobConfig } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

export const log = (config: CronjobConfig, ...args: any[]) => console.log(dtm(config, new Date()), ...args);
export const dtm = (config: CronjobConfig, date: Date) => config.timeFormat.format(date);

/**
 * 返回要处理的文件的绝对路径
 */
export const tryGlobSync = (config: CronjobConfig) => {
  try {
    return fs
      .globSync(config.include, { cwd: config.dir, exclude: config.exclude })
      .map((v) => path.resolve(config.dir, v));
  } catch (e) {
    log(config, `Error while globbing scripts.`, e);
    return null;
  }
};
