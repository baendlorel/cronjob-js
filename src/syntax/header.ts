import type { CronjobContext } from '../types/config.js';

import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** 文件头最多读 64KB；比这小的文件由调用方直接整读 */
export const MAX_HEADER = 64 * 1024;

/**
 * 只读大文件的前 MAX_HEADER 字节，一次定位读，不循环。
 * - 读出来的内容可能带上一行正式代码或半行，没关系：getJobItem 会在第一行正式代码处切掉
 * - 只有前 64KB 全是注释（说明文件头真的超长）才记 WARN，避免每个大文件每分钟刷一条
 */
export async function readHeader(
  cx: CronjobContext,
  filepath: string,
  allowLine: (line: string) => boolean,
): Promise<string | null> {
  const s = await stat(filepath);
  if (!s.isFile()) {
    cx.log.warn(`Skipped non-regular file: ${path.relative(cx.dir, filepath)}`);
    return null;
  }
  if (s.size < MAX_HEADER) {
    return await readFile(filepath, 'utf8');
  }

  const fh = await open(filepath, 'r');
  try {
    const buf = Buffer.alloc(MAX_HEADER);
    const { bytesRead } = await fh.read(buf, 0, MAX_HEADER, 0);
    const text = buf.subarray(0, bytesRead).toString('utf8');
    if (bytesRead === MAX_HEADER && text.split('\n').every((line) => allowLine(line.trim()))) {
      cx.log.warn(`Header longer than ${MAX_HEADER} bytes, truncated: ${path.relative(cx.dir, filepath)}`);
    }
    return text;
  } finally {
    await fh.close();
  }
}
