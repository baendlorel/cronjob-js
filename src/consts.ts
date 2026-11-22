export const enum Tag {
  Info = '[INFO]',
  Spawn = '[SPAWN]',
  Error = '[ERROR]',
  Warn = '[WARN]',
  Exit = '[EXIT]',
  Debug = '[DEBUG]',
}

/**
 * runner 自己建的目录统一按 0755 创建。
 * - 不能沿用 umask：Debian/Ubuntu 的 USERGROUPS_ENAB 默认 umask 002，mkdir 会建出 775，
 *   紧接着被 checkDirPermissions 拒绝，第一次部署就起不来（F44）
 * - 0755 本身不带 group/other 写位，任何 umask 下都只会更收紧，不会更宽松
 */
export const DIR_MODE = 0o755;

export const enum CronjobState {
  Running,
  Paused,
  Stopped,
}

export namespace Marker {
  export const CRON = '@cron' as const;
  export const REGEX = /@cron\b/;

  export const BEGIN = '@cronbegin' as const;
  export const BEGIN_REGEX = /@cronbegin\b/;
  export const END = '@cronend' as const;
  export const END_REGEX = /@cronend\b/;

  /** 行内标记：`@cronutc <5 段>`，只让这一条按 UTC 解析 */
  export const UTC = '@cronutc' as const;
  export const UTC_REGEX = /@cronutc\b/;
}

export type CronBlockMaker = typeof Marker.BEGIN | typeof Marker.END;
