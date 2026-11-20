import path from 'node:path';
import { nextRun } from 'cron-fast';
import { getCronExps } from './cron-exp.js';
import { tryGlobSync } from './utils.js';

const files = tryGlobSync();

const cronjobDir = path.join(process.cwd(), 'cronjob');

files?.forEach((v) => {
  const list = getCronExps(v);
  if (!list || list.length === 0) {
    console.log('no exp', path.relative(cronjobDir, v));
    return;
  }
  for (const { exp, group } of list) {
    const args = [path.relative(cronjobDir, v), nextRun(exp)];
    if (group > 0) {
      console.log(`  ${group.toString().padStart(2)} - ${exp.padEnd(20)}`, ...args);
    } else {
      console.log(exp.padEnd(27), ...args);
    }
  }
});
