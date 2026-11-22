import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { type CronjobContext, createContext } from './config.js';
import { tryGlobSync } from './utils.js';
import { loadFiles } from './syntax/job.js';
import { getJobItem } from './syntax/extract.js';
import { parseExp } from './cron/parse.js';

/**
 * 罗列所有定时表达式，效果类似 `crontab -l`
 *
 * 输出四列：下次运行时间、表达式、相对路径、解释器命令
 * - 块内的多条表达式会缩进显示，并标出 group
 * - 同一条表达式每次都重新 parse，避免 next() 改动共享对象的内部游标
 */
export async function list(cx: CronjobContext) {
  const filepaths = tryGlobSync(cx);
  if (!filepaths) {
    return;
  }
  if (filepaths.length === 0) {
    cx.log.info(`No scripts found in ${cx.dir}`);
    return;
  }

  const files = await loadFiles(cx, filepaths);

  for (const f of files) {
    const relativePath = path.relative(cx.dir, f.filepath);

    if (f.error) {
      cx.log.err(`Error loading file ${relativePath}: ${f.error}`);
      continue;
    }
    if (f.content === null) {
      // 非普通文件：readHeader 已经记过 WARN
      continue;
    }

    const item = getJobItem(cx, f.filepath, f.content);
    if (!item) {
      continue;
    }

    if (item.flatCronGroups.length === 0) {
      cx.log.warn(`No cron expression: ${relativePath}`);
      continue;
    }

    const invocation = [item.interpreter.cmd, ...item.interpreter.args, relativePath].join(' ');

    for (const { cron, group } of item.flatCronGroups) {
      const exp = cron.stringify();
      const next = nextRunText(cx, exp, f.filepath);
      const prefix = group > 0 ? `  [${group}] ` : '';
      console.log(`${next.padEnd(24)} ${(prefix + exp).padEnd(18)} ${relativePath.padEnd(32)} ${invocation}`);
    }
  }
}

/** 表达式在上一次 parse 后可能因 impossible date 抛错，这里只展示、不中断整个列表 */
function nextRunText(cx: CronjobContext, exp: string, filepath: string) {
  const parsed = parseExp(cx, exp, filepath);
  if (!parsed) {
    return '(invalid)';
  }
  try {
    return cx.timeFormat.format(parsed.next().toDate());
  } catch {
    return '(no next run)';
  }
}
