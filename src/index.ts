/**
 * # 全局定时任务主理，以每分钟读取来决定是否运行
 * # 1. 只支持：【分 时 日 月 周】 的写法
 * # 2. cron表达式必须写在每个ts、js脚本的第一行或第二行，以注释给出
 */
import { performance } from 'node:perf_hooks';

import { type UserCronjobConfig, createContext } from './config.js';
import { tryGlobSync } from './utils.js';
import { runTask, type TaskController } from './cron/task.js';
import { getJobs, loadFiles } from './syntax/job.js';
import { run } from './run.js';
import { initialize } from './initialize.js';
import { list } from './list.js';

export type { UserCronjobConfig } from './config.js';
export type { TaskController } from './cron/task.js';

/**
 * 启动定时任务主理，返回控制器
 * - 只支持 5 段 cron：分 时 日 月 周
 * - 同一 dir 只允许一个实例
 */
export async function cronjob(config?: Partial<UserCronjobConfig>): Promise<TaskController> {
  const cx = createContext(config);
  cx.log.info(`Config loaded: ${JSON.stringify(cx)}`);

  if (process.argv.includes('--list') || process.argv.includes('-l')) {
    // 列出所有任务看一下效果就退出
    await list(cx);
    process.exit(0);
  }

  await initialize(cx);

  const taskFn = async (now: Date) => {
    // 1、查找CRONJOB_DIR下面的所有符合suffix的文件
    const filepaths = tryGlobSync(cx);
    if (!filepaths) {
      return;
    }
    if (filepaths.length === 0) {
      cx.log.info(`No scripts found.`);
      return;
    }

    const performanceNow = performance.now();
    cx.log.debug(`Start`);

    const files = await loadFiles(filepaths);
    const jobs = await getJobs(cx, files, now);

    for (let i = 0; i < jobs.length; i++) {
      for (let n = 0; n < jobs[i].count; n++) {
        run(cx, jobs[i]);
      }
    }

    cx.log.debug(`Finished in ${(performance.now() - performanceNow).toFixed(6)}ms`);
  };

  const task = runTask(cx, taskFn);

  cx.log.info(`Cronjob start! pid=${process.pid}`);

  return task;
}
