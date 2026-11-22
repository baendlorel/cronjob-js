import type { CronjobState, Tag } from '../consts.js';
import type { CronjobLogger } from './global.js';

export interface UserCronjobConfig {
  /**
   * Will scan this directory for cronjob scripts
   */
  dir: string;

  /**
   * Will put log files there.
   * - Share the same structure as the cronjob scripts directory
   * default value is the same as `this.dir`
   */
  logDir: string;

  /**
   * Glob expressions to get cronjob scripts.
   * - Will be passed to fs.glob
   *
   * default value is `[path.join('**', '*.{ts,js,sh}')]`
   */
  include: string[];

  /**
   * Glob expressions to exclude cronjob scripts.
   * - Will be passed to fs.glob as `exclude`
   * - 默认值会去掉node_modules、.git、.vscode、.claude、__pycache__
   */
  exclude: string[];

  /**
   * Affects log time and cron parsing.
   *
   * default value is `"Asia/Shanghai"`
   */
  timezone: string;

  /**
   * The working directory for the running cronjob scripts.
   * - Use function to determine dynamic cwd by the script path.
   *
   * default value is the same as `this.dir`
   */
  jobcwd: string | ((scriptPath: string) => string);

  /**
   * Function to write logs.
   * @param tag The tag for the log entry.
   * @param args The arguments to log.
   *
   * default value writes `<dtm> <tag> <args>` to console
   */
  write: (tag: Tag, ...args: any[]) => void;
}

export interface CronjobContext extends UserCronjobConfig {
  /**
   * 时间格式化器，日志与 list 输出都用它
   */
  timeFormat: Intl.DateTimeFormat;
  /**
   * 很多地方传参都是这个样子的，因此直接给一个方便不要反复创建
   */
  jobcwd: (scriptPath: string) => string;

  // # 这是增加的字段
  /**
   * The current state of the cronjob.
   */
  jobState: CronjobState;

  // 用 ReturnType 而不是 NodeJS.Timeout：消费者的 tsconfig 不一定带 @types/node
  jobTimer: ReturnType<typeof setTimeout> | null;

  log: CronjobLogger;
}
