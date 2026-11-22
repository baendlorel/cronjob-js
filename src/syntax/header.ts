import type { CronjobContext } from '../config.js';

import { open } from 'node:fs/promises';
import path from 'node:path';

/** 每次最多读 16KB；正常文件头就几行，一次就够 */
const BLOCK = 16 * 1024;
/** 文件头最多 64KB，防止整文件都是注释时无限读下去 */
const MAX_HEADER = 64 * 1024;

/**
 * 只读文件头：逐块读，遇到第一行正式代码（`allowLine` 返回 false）就停。
 * - 不整读大文件：214MB 的脚本也只读第一块
 * - 文件头超过 MAX_HEADER 时截断并记 WARN
 */
export async function readHeader(
  cx: CronjobContext,
  filepath: string,
  allowLine: (line: string) => boolean,
): Promise<string> {
  const fh = await open(filepath, 'r');
  try {
    const chunks: string[] = [];
    let rest = '';
    for (let offset = 0; offset < MAX_HEADER; offset += BLOCK) {
      const buf = Buffer.alloc(BLOCK);
      const { bytesRead } = await fh.read(buf, 0, BLOCK, offset);
      if (bytesRead === 0) {
        return chunks.join('');
      }
      const chunk = buf.subarray(0, bytesRead).toString('utf8');
      chunks.push(chunk);

      // 最后一段可能是半行，留到下一块再判断
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      if (lines.some((line) => !allowLine(line.trim())) || !allowLine(rest.trim())) {
        return chunks.join('');
      }
    }

    cx.log.warn(`Header longer than ${MAX_HEADER} bytes, truncated: ${path.relative(cx.dir, filepath)}`);
    return chunks.join('');
  } finally {
    await fh.close();
  }
}
