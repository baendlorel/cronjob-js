import type { CronjobContext } from '../config.js';

let running = true;

export function runTask(config: CronjobContext, fn: (now: Date) => void) {
  const now = new Date();
  const nextMinute = new Date(now.getTime() + 60000);
  nextMinute.setSeconds(0, 0);

  setTimeout(() => {
    if (!running) return;
    //! 定时器可能早于边界触发，相当于等了但还没等到呢，再等一会
    if (Date.now() < nextMinute.getTime()) {
      runTask(config, fn);
      return;
    }
    fn(new Date());
    runTask(config, fn);
  }, nextMinute.getTime() - now.getTime());
}

export function stopTask() {
  running = false;
}
