/**
 * # 全局定时任务主理，以每分钟读取来决定是否运行
 * # 1. 只支持：【分 时 日 月 周】 的写法
 * # 2. cron表达式必须写在每个ts、js脚本的第一行或第二行，以注释给出
 */
import { performance } from 'node:perf_hooks';

import { type UserCronjobConfig, loadConfig } from './config.js';
import { log, tryGlobSync } from './utils.js';
import { runTask, type TaskController } from './cron/task.js';
import { getJobs, loadFiles } from './syntax/job.js';
import { run } from './run.js';
import { initialize } from './initialize.js';

export async function cronjob(config?: Partial<UserCronjobConfig>): Promise<TaskController>;
export async function cronjob(_config?: Partial<UserCronjobConfig>) {
  const config = loadConfig(_config);
  log(config, `Config loaded: ${JSON.stringify(config)}`);

  await initialize(config);

  const taskFn = async (now: Date) => {
    // 1、查找CRONJOB_DIR下面的所有符合suffix的文件
    const filepaths = tryGlobSync(config);
    if (!filepaths) {
      return;
    }
    if (filepaths.length === 0) {
      log(config, `No scripts found.`);
      return;
    }

    const performanceNow = performance.now();
    log(config, `Start`);

    const files = await loadFiles(filepaths);
    const jobs = await getJobs(config, files, now);

    for (let i = 0; i < jobs.length; i++) {
      for (let n = 0; n < jobs[i].count; n++) {
        run(config, jobs[i]);
      }
    }

    log(config, `Finished in ${(performance.now() - performanceNow).toFixed(6)}ms`);
  };

  const task = runTask(config, taskFn);

  log(config, `Cronjob start! pid=${process.pid}`);

  return task;
}
