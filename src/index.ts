/**
 * # 全局定时任务主理，以每分钟读取来决定是否运行
 * # 1. 只支持：【分 时 日 月 周】 的写法
 * # 2. cron 表达式写在脚本的文件头注释区（第一条正式代码之前的注释），以注释给出
 */
import type { UserCronjobConfig } from './types/config.js';
import { performance } from 'node:perf_hooks';

import { createContext } from './context/index.js';
import { CronjobState } from './consts.js';
import { tryGlobSync } from './utils.js';
import { runTask, type TaskController } from './cron/task.js';
import { getJobs, loadFiles } from './syntax/job.js';
import { run } from './run.js';
import { initialize } from './initialize.js';
import { list } from './list.js';

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

    const files = await loadFiles(cx, filepaths);
    const jobs = await getJobs(cx, files, now);

    // 读文件期间可能被 stop() / pause()（F33）：已不在 Running 就不再 spawn 这一轮
    if (cx.jobState === CronjobState.Stopped) {
      return;
    }

    for (let i = 0; i < jobs.length; i++) {
      for (let n = 0; n < jobs[i].count; n++) {
        if (cx.jobState === CronjobState.Running) {
          run(cx, jobs[i]);
        }
      }
    }

    cx.log.debug(`Finished in ${(performance.now() - performanceNow).toFixed(6)}ms`);
  };

  const task = runTask(cx, taskFn);

  cx.log.info(`Cronjob start! pid=${process.pid}`);

  return task;
}
