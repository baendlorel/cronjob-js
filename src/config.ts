import { CronjobState, Tag } from './consts.js';

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
   * - Will be passed to fs.glob with the `ignore` option.
   *
   * default value is `['node_modules/','.git','.vscode','.claude','__pycache__']`
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
   */
  write: (tag: Tag, ...args: any[]) => void;
}

export interface CronjobContext extends UserCronjobConfig {
  timeFormat: Intl.DateTimeFormat;

  /**
   * 很多地方传参都是这个样子的，因此直接给一个方便不要反复创建
   */
  timezoneConfig: { timezone: string; tz: string };
  jobcwd: (scriptPath: string) => string;

  // # 这是增加的字段
  /**
   * The current state of the cronjob.
   */
  jobState: CronjobState;

  jobTimer: NodeJS.Timeout | null;

  log: {
    info: (...args: any[]) => any;
    err: (...args: any[]) => any;
    warn: (...args: any[]) => any;
    spawn: (...args: any[]) => any;
    exit: (...args: any[]) => any;
    debug: (...args: any[]) => any;
  };
}

const defaultWrite = (cx: CronjobContext, tag: string, args: any[]) =>
  console.log(cx.timeFormat.format(new Date()), tag, ...args);

const createLogger = (cx: CronjobContext) => ({
  info: (...args: any[]) => cx.write(Tag.Info, ...args),
  err: (...args: any[]) => cx.write(Tag.Error, ...args),
  warn: (...args: any[]) => cx.write(Tag.Warn, ...args),
  spawn: (...args: any[]) => cx.write(Tag.Spawn, ...args),
  exit: (...args: any[]) => cx.write(Tag.Exit, ...args),
  debug: (...args: any[]) => cx.write(Tag.Debug, ...args),
});

export function createContext(rawConfig?: Partial<UserCronjobConfig>): CronjobContext {
  const {
    dir = process.cwd(),
    logDir = dir,
    jobcwd = dir,
    include = ['**/*.{ts,js,sh}'],
    exclude = ['node_modules/', '.git', '.vscode', '.claude', '__pycache__'],
    timezone = 'Asia/Shanghai',
    write = (tag: Tag, ...args: any[]) => defaultWrite(cx, tag, args),
  } = Object(rawConfig) as UserCronjobConfig;

  if (typeof dir !== 'string') {
    throw new TypeError('`dir` must be a string');
  }

  if (typeof logDir !== 'string') {
    throw new TypeError('`logDir` must be a string');
  }

  // Validate timezone by attempting to create a DateTimeFormat with it
  new Intl.DateTimeFormat('en-US', { timeZone: timezone });

  if (!Array.isArray(include) || include.some((pattern) => typeof pattern !== 'string')) {
    throw new TypeError('`include` must be an array of strings');
  }
  if (!Array.isArray(exclude) || exclude.some((pattern) => typeof pattern !== 'string')) {
    throw new TypeError('`exclude` must be an array of strings');
  }

  const cx: CronjobContext = {
    dir,
    logDir,
    jobcwd: typeof jobcwd === 'function' ? jobcwd : () => jobcwd,
    include,
    exclude,
    timezone,
    timezoneConfig: { timezone, tz: timezone },
    timeFormat: new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false,
      timeZone: timezone,
    }),
    jobState: CronjobState.Running,
    jobTimer: null,
    write,
    log: null as any,
  };

  cx.log = createLogger(cx);

  return cx;
}
