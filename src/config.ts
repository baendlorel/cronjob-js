interface UserCronjobConfig {
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
}

export interface CronjobConfig extends UserCronjobConfig {
  timeFormat: Intl.DateTimeFormat;
  jobcwd: (scriptPath: string) => string;
}

export const cronjobConfig: CronjobConfig = {} as CronjobConfig;

export function load(rawConfig?: Partial<UserCronjobConfig>) {
  const {
    dir = process.cwd(),
    logDir = dir,
    jobcwd = dir,
    include = ['**/*.{ts,js,sh}'],
    timezone = 'Asia/Shanghai',
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

  cronjobConfig.dir = dir;
  cronjobConfig.logDir = logDir;
  cronjobConfig.jobcwd = typeof jobcwd === 'function' ? jobcwd : () => jobcwd;
  cronjobConfig.include = include;
  cronjobConfig.timezone = timezone;
  cronjobConfig.timeFormat = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
    timeZone: timezone,
  });
}
