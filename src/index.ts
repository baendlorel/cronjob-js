/**
 * # 全局定时任务主理，以每分钟读取来决定是否运行
 * # 1. 只支持：【分 时 日 月 周】 的写法
 * # 2. cron表达式必须写在每个ts、js脚本的第一行或第二行，以注释给出
 */
import cron from 'node-cron';
import { performance } from 'node:perf_hooks';

import { log, tryGlobSync, getCwd } from './utils.js';
import { shouldRun } from './cron-exp.js';
import { runFile } from './run.js';
import { initialize } from './initialize.js';

export const cronjob = async () => {
  try {
    // 初始化完成（拿到单例锁、目录就绪）之前不要开始调度
    await initialize();

    const cwd = getCwd();
    const task = cron.schedule('* * * * *', () => {
      // # 尽早读取new Date，早于globSync，让取到的时间更接近x分0秒
      const now = new Date();

      // 1、查找CRONJOB_DIR下面的所有符合suffix的文件
      const files = tryGlobSync();
      if (!files) {
        return;
      }
      if (files.length === 0) {
        log(`No scripts found.`);
        return;
      }

      // TODO 显示配置
      const performanceNow = performance.now();
      log(`Start`);

      for (let i = 0; i < files.length; i++) {
        const fullpath = files[i];
        // 没有匹配到 cron 的，不运行
        const jobs = shouldRun(fullpath, now);
        if (!jobs || jobs.length === 0) {
          continue;
        }

        // 符合，则开始运行
        for (let i = 0; i < jobs.length; i++) {
          runFile({ fullpath, dev: jobs[i].dev, cwd });
        }
      }

      log(`Finished in ${(performance.now() - performanceNow).toFixed(6)}ms`);
    });

    log(`Cronjob start! pid=${process.pid}`);
    // # 必须停止task才能正常退出，正常被pm2重启
    process.on('SIGINT', () => {
      log(`SIGINT,pid=${process.pid}`);
      task.stop();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      log(`SIGTERM,pid=${process.pid}`);
      task.stop();
      process.exit(0);
    });
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
    process.exit(1);
  }
};
