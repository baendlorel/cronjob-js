import { readFile } from 'node:fs/promises';
import cron from 'node-cron';
import { log } from '../utils.js';
import { getCronExps } from './extract.js';

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
  const rawFiles = await loadFiles(filepaths);

  const files = rawFiles
    .filter((v): v is FileContent => {
      if (v.error) {
        log(`Error loading file ${v.filepath}: ${v.error}`);
        return false;
      } else {
        return true;
      }
    })
    .map((v) => {
      const lines = v.content.split('\n').map((line) => line.trim());
      return getCronExps(v.filepath, lines);
    });

  // TODO 这里要有默认的shebang，也就是解释器
  const runList: { filepath: string; shebang: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) {
      continue;
    }

    const zero = file.map.get(0);
    if (zero) {
      for (const item of zero) {
        cron.validateDetailed(item);
      }
    }
  }

  files.map((file) => {
    file.map.forEach((exps, group) => {
      exps.forEach((exp) => {
        // 这里可以处理每个 cron 表达式
      });
    });
  });

  return runList;
}
