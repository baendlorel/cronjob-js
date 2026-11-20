export interface Interpreter {
  cmd: string;
  args: string[];
}

/**
 * 按照cron表达式分组
 */
export interface CronExpItem {
  exp: string;
  group: number;
}

interface JobBase {
  filepath: string;
  interpreter: Interpreter;
}

/**
 * 被解析出来的时候的初步状态
 * - 这个中间状态是为了方便函数式的测试
 */
export interface JobItem extends JobBase {
  /**
   * 这个中间状态是为了方便函数式的测试
   */
  list: CronExpItem[];
}

export interface Job extends JobBase {
  count: number;
}

export interface FileContent {
  filepath: string;
  content: string | null;
  error: Error | null;
}
