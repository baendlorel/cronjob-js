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
  export const CRON_REGEX = /@cron\b/;

  export const BEGIN = '@cronbegin' as const;
  export const BEGIN_REGEX = /@cronbegin\b/;
  export const END = '@cronend' as const;
  export const END_REGEX = /@cronend\b/;
}

export type CronBlockMaker = typeof Marker.BEGIN | typeof Marker.END;
