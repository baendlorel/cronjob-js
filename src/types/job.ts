import type { CronExpression } from 'cron-parser';

export interface Interpreter {
  cmd: string;
  args: string[];
}

/**
 * 按照cron表达式分组
 */
export interface CronGroupItem {
  group: number;
  cron: CronExpression;
  /** cron 语义所用时区：'UTC'（@cronutc 之后的表达式）或 cx.timezone */
  timezone: string;
}

interface JobBase {
  /**
   * 完整文件路径
   */
  filepath: string;

  /**
   * 解释器信息，包含命令和参数
   */
  interpreter: Interpreter;
}

/**
 * 被解析出来的时候的初步状态
 * - 这个中间状态是为了方便函数式的测试
 */
export interface JobItem extends JobBase {
  /**
   * 扁平化的 cron 分组列表，会包含多个相同group数字的项。
   * - 这个中间状态是为了方便函数式的测试
   */
  flatCronGroups: CronGroupItem[];
}

export interface Job extends JobBase {
  count: number;
}
