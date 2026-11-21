import type { CronjobConfig } from '../config.js';

let running = true;

export function runTask(config: CronjobConfig, fn: (now: Date) => void) {
  const now = new Date();
  const nextMinute = new Date(now.getTime() + 60000);
  nextMinute.setSeconds(0, 0);

  setTimeout(() => {
    if (!running) return;
    // 定时器可能早于边界触发（实测 WSL 下约 -400ms），此时仍属上一分钟，
    // 直接跑会重复判定同一分钟；重新排到边界即可
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
