import type { CronjobContext } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

import { Tag } from './consts.js';

export const dtm = (cx: CronjobContext, date: Date) => cx.timeFormat.format(date);

const write = (cx: CronjobContext, tag: string, args: any[]) => console.log(dtm(cx, new Date()), tag, ...args);

/**
 * 主日志。格式固定为：<dtm> <tag> <args>
 * - 调用点只传内容，tag 由这里统一加，避免每处手写前缀
 * - debug 只在带 --dev 启动时输出
 */
export const log = {
  info: (cx: CronjobContext, ...args: any[]) => write(cx, '[Info]', args),
  err: (cx: CronjobContext, ...args: any[]) => write(cx, Tag.Error, args),
  warn: (cx: CronjobContext, ...args: any[]) => write(cx, Tag.Warn, args),
  spawn: (cx: CronjobContext, ...args: any[]) => write(cx, Tag.Spawn, args),
  exit: (cx: CronjobContext, ...args: any[]) => write(cx, Tag.Exit, args),
  debug: (cx: CronjobContext, ...args: any[]) => write(cx, Tag.Debug, args),
};

/**
 * 返回要处理的文件的绝对路径
 */
export const tryGlobSync = (cx: CronjobContext) => {
  try {
    return fs.globSync(cx.include, { cwd: cx.dir, exclude: cx.exclude }).map((v) => path.resolve(cx.dir, v));
  } catch (e) {
    log.err(cx, `Error while globbing scripts.`, e);
    return null;
  }
};
