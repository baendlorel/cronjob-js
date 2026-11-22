import type { Job, JobItem } from '../types/global.js';
import type { CronjobContext } from '../config.js';

import path from 'node:path';

import { getJobItem } from './extract.js';
import { matches } from '../cron/parse.js';
import { getAllowFn } from './allow.js';
import { readHeader } from './header.js';

export type FileContent =
  | {
      filepath: string;
      /** null = 已跳过（非普通文件），readHeader 已经记过 WARN，不算读取失败 */
      content: string | null;
      error: null;
    }
  | {
      filepath: string;
      content: null;
      error: any;
    };

const CHUNK_SIZE = 100;

/**
 * stat 并读取文件头，一个文件对应一条结果，失败也包成结果、不抛出。
 * - 先 stat：FIFO、设备、目录等非普通文件直接跳过（对 FIFO 做 readFile 会永久阻塞线程池）
 * - 只读文件头：大文件不再整读进内存
 */
export async function loadFiles(cx: CronjobContext, filepaths: string[]): Promise<Array<FileContent>> {
  const result: Array<FileContent> = [];
  for (let i = 0; i < filepaths.length; i += CHUNK_SIZE) {
    const promises = filepaths.slice(i, i + CHUNK_SIZE).map(async (filepath): Promise<FileContent> => {
      try {
        const allower = getAllowFn(path.extname(filepath));
        const content = await readHeader(cx, filepath, allower);
        return { filepath, content, error: null };
      } catch (error) {
        return { filepath, content: null, error };
      }
    });
    const r = await Promise.all(promises);
    result.push(...r);
  }

  return result;
}

/**
 * 获取现在应该运行的job
 * - 不会有人写非常多的 cron 表达式，直接遍历即可
 *
 * ! 仅用于同一个filepath
 *
 * @param cx Cronjob 上下文
 * @param item JobItem 对象
 * @param now 当前时间，**秒数、毫秒数为0**
 */
export function getMatchedJob(cx: CronjobContext, item: JobItem, now: Date): Job {
  let count = 0;
  const set = new Set<number>();
  for (let i = 0; i < item.flatCronGroups.length; i++) {
    const job = item.flatCronGroups[i];
    if (job.group === 0 && matches(job.cron, now)) {
      count++;
      continue;
    }
    if (!set.has(job.group) && matches(job.cron, now)) {
      count++;
      set.add(job.group);
    }
  }
  return { filepath: item.filepath, interpreter: item.interpreter, count };
}

/**
 * 判断文件本轮是否该运行
 *
 * @param cx Cronjob 上下文
 * @param files 文件内容数组
 * @param now 当前时间，**秒数、毫秒数为0**
 * @returns 要跑的 cron，要跑多少次；
 */
export function getJobs(cx: CronjobContext, files: FileContent[], now: Date): Job[] {
  const jobs: Job[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.error) {
      cx.log.err(`Error loading file ${path.relative(cx.dir, f.filepath)}: ${f.error}`);
      continue;
    }
    if (f.content === null) {
      // 非普通文件：readHeader 已经记过 WARN，这里不再刷 Error
      continue;
    }

    const jobItem = getJobItem(cx, f.filepath, f.content);
    if (!jobItem) {
      continue;
    }

    // 这里要把shebang算好，matchedjob要运行多少次直接看数字
    const job = getMatchedJob(cx, jobItem, now);
    if (job.count > 0) {
      jobs.push(job);
    }
  }

  return jobs;
}
