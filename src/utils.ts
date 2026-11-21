import fs from 'node:fs';
import path from 'node:path';
import { type CronjobConfig, cronjobConfig } from './config.js';

// TODO 这里有不用cronjobConfig这个全局对象的办法吗
export const log = (...args: any[]) => console.log(dtm(new Date()), ...args);
export const dtm = (date: Date) => cronjobConfig.timeFormat.format(date);

/**
 * 返回要处理的文件的绝对路径
 */
export const tryGlobSync = (config: CronjobConfig) => {
  try {
    return fs
      .globSync(config.include, { cwd: config.dir, exclude: config.exclude })
      .map((v) => path.resolve(config.dir, v));
  } catch (e) {
    log(`Error while globbing scripts.`, e);
    return null;
  }
};
