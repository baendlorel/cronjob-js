import path from 'node:path';
import { nextRun } from 'cron-fast';
import { tryGlobSync } from './utils.js';
import { getJobItem } from './syntax/extract.js';

// TODO 这里要重写，要改为可以罗列所有定时表达式+文件名+cmd的形式。就像crontab -l的效果

const files = tryGlobSync();

const cronjobDir = path.join(process.cwd(), 'cronjob');

files?.forEach((v) => {
  const list = getJobItem(v);
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
