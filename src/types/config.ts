import type { CronjobState, Tag } from '../consts.js';
import type { CronjobLogger } from './global.js';
import type { Runtime } from '../context/interpreter.js';

export interface UserCronjobConfig {
  /**
   * 扫描任务脚本的目录
   */
  dir: string;

  /**
   * 任务日志的存放目录
   * - 目录结构与任务脚本目录保持一致
   * 默认值与 `dir` 相同
   */
  logDir: string;

  /**
   * 用来匹配任务脚本的 glob 表达式
   * - 会原样传给 fs.glob
   *
   * 默认值是 `['**&#47;*.{ts,js,sh,cts,mts,cjs,mjs,py}']`（即 `**` 斜杠 `*.{ts,js,sh,cts,mts,cjs,mjs,py}`）
   */
  include: string[];

  /**
   * 排除任务脚本的 glob 表达式
   * - 会作为 `exclude` 传给 fs.glob
   * - 整体替换默认值（两个数组不会合并）
   * - 默认值排除 node_modules、.git、.vscode、.claude、__pycache__、
   *   dist、dist-tsc、coverage，任意层级都生效
   */
  exclude: string[];

  /**
   * 影响日志时间戳和 cron 解析
   *
   * 默认值是 `"Asia/Shanghai"`
   */
  timezone: string;

  /**
   * 任务进程的工作目录
   * - 传函数可以按脚本路径动态决定
   *
   * 默认值与 `dir` 相同
   */
  jobcwd: string | ((scriptPath: string) => string);

  /**
   * 为了避免极端情况下，setTimeout略微提早一点点触发，进行时间修正的毫秒数
   *
   * 默认值为1
   */
  scheduleCorrection: number;

  /**
   * 输出日志的函数
   * @param tag 日志标记
   * @param args 要记录的内容
   *
   * 默认值把 `<dtm> <tag> <args>` 写到 console
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
   * 当前调度状态
   */
  jobState: CronjobState;

  // 用 ReturnType 而不是 NodeJS.Timeout：消费者的 tsconfig 不一定带 @types/node
  jobTimer: ReturnType<typeof setTimeout> | null;

  log: CronjobLogger;
}
