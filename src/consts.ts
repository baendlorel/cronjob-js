export const enum LogTag {
  Spawned = '[Spawned]',
  Error = '[Error]',
  Exit = '[Exit]',
}

export const DEV_FLAG = '--dev';

export namespace Marker {
  export const CRON = '@cron';
  export const CRON_REGEX = /@cron\b/;

  export const BEGIN = '@cronbegin';
  export const BEGIN_REGEX = /@cronbegin\b/;
  export const END = '@cronend';
  export const END_REGEX = /@cronend\b/;
}
