import type { CronjobConfig } from '../config.js';

let running = true;

export function runTask(config: CronjobConfig, fn: (now: Date) => void) {
  const now = new Date();
  const nextMinute = new Date(now.getTime() + 60000);
  nextMinute.setSeconds(0, 0);

  setTimeout(() => {
    if (running) {
      fn(now);
      runTask(config, fn);
    }
  }, nextMinute.getTime() - now.getTime());
}

export function stopTask() {
  running = false;
}
