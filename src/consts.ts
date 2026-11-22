export const enum Tag {
  Info = '[INFO]',
  Spawn = '[SPAWN]',
  Error = '[ERROR]',
  Warn = '[WARN]',
  Exit = '[EXIT]',
  Debug = '[DEBUG]',
}

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
