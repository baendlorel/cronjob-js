import type { Job, JobItem } from '../types/job.js';
import type { CronjobContext } from '../config.js';

import { readFile } from 'node:fs/promises';
import { log } from '../utils.js';
import { getJobItem } from './extract.js';
import { matches } from '../cron/parse.js';

type FileContent =
  | {
      filepath: string;
      content: string;
      error: null;
    }
  | {
      filepath: string;
      content: null;
      error: any;
    };

const CHUNK_SIZE = 100;
export async function loadFiles(filepaths: string[]): Promise<Array<FileContent>> {
  const result: Array<FileContent> = [];
  for (let i = 0; i < filepaths.length; i += CHUNK_SIZE) {
    const promises = filepaths.slice(i, i + CHUNK_SIZE).map((filepath) =>
      readFile(filepath, 'utf8')
        .then((content) => ({ filepath, content, error: null }))
        .catch((error) => ({ filepath, content: null, error })),
    );
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
 */
export function getMatchedJob(config: CronjobContext, item: JobItem, now: Date): Job {
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
 * @returns 要跑的 cron，要跑多少次；
 */
export function getJobs(config: CronjobContext, files: FileContent[], now: Date): Job[] {
  const jobs: Job[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.content) {
      log(`Error loading file ${f.filepath}: ${f.error}`);
      continue;
    }

    const lines = f.content.split('\n').map((line) => line.trim());
    const jobItem = getJobItem(config, f.filepath, lines);
    if (!jobItem) {
      continue;
    }

    // 这里要把shebang算好，matchedjob要运行多少次直接看数字
    const job = getMatchedJob(config, jobItem, now);
    if (job.count > 0) {
      jobs.push(job);
    }
  }

  return jobs;
}
