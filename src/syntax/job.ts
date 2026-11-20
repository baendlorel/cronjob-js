import type { FileContent, Job, JobItem } from '../types/job.js';
import type { CronjobConfig } from '../config.js';
import { readFile } from 'node:fs/promises';
import { isMatch } from 'cron-fast';
import { log } from '../utils.js';
import { getCronExps } from './extract.js';

const CHUNK_SIZE = 100;
export async function loadFiles(filepaths: string[]): Promise<FileContent[]> {
  const result: FileContent[] = [];
  for (let i = 0; i < filepaths.length; i += CHUNK_SIZE) {
    const chunk = filepaths.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map((filepath) =>
      readFile(filepath, 'utf8')
        .then((content) => ({ filepath, content, error: null }) as FileContent)
        .catch((error) => ({ filepath, content: null, error }) as FileContent),
    );
    const chunkResult = await Promise.all(promises);
    result.push(...chunkResult);
  }

  return result;
}

/**
 * 判断文件本轮是否该运行
 *
 * @returns 要跑的 cron，要跑多少次；
 */
export async function shouldRun(config: CronjobConfig, filepaths: string[], now: Date): Promise<Job[]> {
  const files = await loadFiles(filepaths);

  const runs: Job[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.content) {
      log(`Error loading file ${f.filepath}: ${f.error}`);
      continue;
    }

    const lines = f.content.split('\n').map((line) => line.trim());
    const raw = getCronExps(f.filepath, lines);
    if (!raw) {
      continue;
    }

    // 这里要把shebang算好，matchedjob要运行多少次直接看数字
    const matchedJobs = getMatchedJob(config, raw, now);
    if (matchedJobs.count > 0) {
      runs.push(matchedJobs);
    }
  }

  return runs;
}

/**
 * 获取现在应该运行的job
 * - 不会有人写非常多的 cron 表达式，直接遍历即可
 *
 * ! 仅用于同一个filepath
 */
export function getMatchedJob(config: CronjobConfig, item: JobItem, now: Date): Job {
  let count = 0;
  const set = new Set<number>();
  for (let i = 0; i < item.list.length; i++) {
    const job = item.list[i];
    if (job.group === 0 && isMatch(job.exp, now, { timezone: config.timezone })) {
      count++;
      continue;
    }
    if (!set.has(job.group) && isMatch(job.exp, now, { timezone: config.timezone })) {
      count++;
      set.add(job.group);
    }
  }
  return { filepath: item.filepath, interpreter: item.interpreter, count };
}
