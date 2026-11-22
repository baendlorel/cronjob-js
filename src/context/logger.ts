import type { CronjobLogger } from '../types/global.js';
import type { UserCronjobConfig } from '../types/config.js';
import { Tag } from '../consts.js';

/**
 * 把 cx.write 包装成带 tag 的方法。
 * - write 是唯一的输出出口，消费者可以整条替换（默认写 stdout）
 */
export function createLogger(write: UserCronjobConfig['write']): CronjobLogger {
  return {
    info: (...args: any[]) => write(Tag.Info, ...args),
    err: (...args: any[]) => write(Tag.Error, ...args),
    warn: (...args: any[]) => write(Tag.Warn, ...args),
    spawn: (...args: any[]) => write(Tag.Spawn, ...args),
    exit: (...args: any[]) => write(Tag.Exit, ...args),
    debug: (...args: any[]) => write(Tag.Debug, ...args),
  };
}

/** 默认输出：`<dtm> <TAG> <内容>`，dtm 用 cx.timezone */
export function defaultWrite(formatter: Intl.DateTimeFormat): UserCronjobConfig['write'] {
  return (tag: Tag, ...args: any[]) => console.log(formatter.format(new Date()), tag, ...args);
}
