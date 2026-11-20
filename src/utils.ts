import fs from 'node:fs';
import { cronjobConfig } from './config.js';

export const log = (...args: any[]) => console.log(dtm(new Date()), ...args);
export const dtm = (date: Date) => cronjobConfig.timeFormat.format(date);

export const tryGlobSync = () => {
  try {
    return fs.globSync(cronjobConfig.include, { cwd: cronjobConfig.dir });
  } catch (e) {
    log(`Error while globbing scripts.`, e);
    return null;
  }
};
