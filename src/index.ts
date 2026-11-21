/**
 * # 全局定时任务主理，以每分钟读取来决定是否运行
 * # 1. 只支持：【分 时 日 月 周】 的写法
 * # 2. cron表达式必须写在每个ts、js脚本的第一行或第二行，以注释给出
 */
import { performance } from 'node:perf_hooks';

import { type CronjobConfig, loadConfig } from './config.js';
import { log, tryGlobSync } from './utils.js';
import { runTask, stopTask } from './cron/task.js';
import { shouldRun } from './syntax/job.js';
import { run } from './run.js';

export const cronjob = (rawConfig: Partial<CronjobConfig>) => {
  try {
    const config = loadConfig(rawConfig);
    log(`Config loaded: ${JSON.stringify(config)}`);

    const taskFn = async (now: Date) => {
      // 1、查找CRONJOB_DIR下面的所有符合suffix的文件
      const files = tryGlobSync(config);
      if (!files) {
        return;
      }
      if (files.length === 0) {
        log(`No scripts found.`);
        return;
      }

      const performanceNow = performance.now();
      log(`Start`);

      const jobs = await shouldRun(config, files, now);

      for (let i = 0; i < jobs.length; i++) {
        for (let n = 0; n < jobs[i].count; n++) {
          run(config, jobs[i]);
        }
      }

      log(`Finished in ${(performance.now() - performanceNow).toFixed(6)}ms`);
    };

    runTask(config, taskFn);

    log(`Cronjob start! pid=${process.pid}`);
    // # 必须停止task才能正常退出，正常被pm2重启
    process.on('SIGINT', () => {
      log(`SIGINT,pid=${process.pid}`);
      stopTask();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      log(`SIGTERM,pid=${process.pid}`);
      stopTask();
      process.exit(0);
    });
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
    process.exit(1);
  }
};
