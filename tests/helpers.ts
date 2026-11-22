import type { CronjobContext } from '../src/types/config.js';
import type { Tag } from '../src/consts.js';

import { createContext } from '../src/context/index.js';

export interface LogRecord {
  tag: Tag;
  args: any[];
}

/**
 * 收集所有日志、不碰真实 stdout 的上下文
 * - 纯函数被测时也走同一套 cx.log，顺便验证了日志路径
 */
export function createTestContext(overrides: Partial<Parameters<typeof createContext>[0]> = {}) {
  const logs: LogRecord[] = [];
  const cx = createContext({
    dir: '/virtual/dir',
    write: (tag: Tag, ...args: any[]) => {
      logs.push({ tag, args });
    },
    ...overrides,
  });
  return { cx, logs };
}

/** 取某个 tag 的日志，压平成 `[tag, ...args]` 方便断言 */
export const logsOf = (logs: LogRecord[], tag: Tag) => logs.filter((l) => l.tag === tag);

export const parseLines = (content: string) => content.split('\n').map((line) => line.trim());

export const ctxOf = (cx: CronjobContext) => cx;
