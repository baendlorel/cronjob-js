import type { CronjobState, Tag } from '../consts.js';
import type { CronjobLogger } from './global.js';
import type { Runtime } from '../context/interpreter.js';

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
   * default value is `['**&#47;*.{ts,js,sh}']` (i.e. `**` slash `*.{ts,js,sh}`)
   */
  include: string[];

  /**
   * Glob expressions to exclude cronjob scripts.
   * - Will be passed to fs.glob as `exclude`
   * - Replaces the default entirely (the two arrays are not merged)
   * - default value drops node_modules, .git, .vscode, .claude, __pycache__,
   *   dist, dist-tsc and coverage, each at any depth
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
   * 运行时探测结果：解释器映射、tsx 是否可用、python 命令
   * - 由 createContext 一次填好，调度和 --list 共用同一份，不会再出现两处不一致
   */
  runtime: Runtime;
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
