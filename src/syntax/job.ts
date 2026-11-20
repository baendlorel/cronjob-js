import { readFile } from 'node:fs/promises';
import cron from 'node-cron';
import { log } from '../utils.js';
import { getCronExps, getMatchedJob, JobItem } from './extract.js';

interface RawFileContent {
  filepath: string;
  content: string | null;
  error: Error | null;
}

interface FileContent {
  filepath: string;
  content: string;
  error: null;
}

const CHUNK_SIZE = 100;
export async function loadFiles(filepaths: string[]) {
  const result: RawFileContent[] = [];
  for (let i = 0; i < filepaths.length; i += CHUNK_SIZE) {
    const chunk = filepaths.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map((filepath) =>
      readFile(filepath, 'utf8')
        .then((content) => ({ filepath, content, error: null }) as RawFileContent)
        .catch((error) => ({ filepath, content: null, error }) as RawFileContent),
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
export async function shouldRun(filepaths: string[], now: Date) {
  const files = await loadFiles(filepaths);

  const jobs: JobItem[] = [];

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
    const matchedJobs = getMatchedJob(raw, now);
    jobs.push(matchedJobs);
  }

  // 所有group为0的，都要单独执行
  // 所有group不为0的，同一个文件下，只要有一条被记录就行

  return runList;
}
