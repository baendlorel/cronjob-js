import type { CronjobContext } from '../config.js';
import { CronjobState } from '../consts.js';

export interface TaskController {
  /** 停止调度：清掉还没触发的定时器，状态置为 Stopped */
  stop: () => void;
  /** 暂停：定时器继续走，但到点不执行 */
  pause: () => void;
  /** 恢复 */
  resume: () => void;
}

/** 下一分钟边界（本地毫秒截断到分钟） */
const nextMinuteBoundary = (from: Date) => {
  const next = new Date(from.getTime() + 60000);
  next.setSeconds(0, 0);
  return next;
};

/**
 * 每分钟执行一次 fn，返回控制对象
 * - 状态全部放在 cx.jobState / cx.jobTimer 里，本函数不持有模块级状态
 * - 每次调度都重新读 cx.jobState，因此 stop/resume 在任意时刻都生效
 */
export function runTask(cx: CronjobContext, fn: (now: Date) => void): TaskController {
  const schedule = () => {
    if (cx.jobState !== CronjobState.Running) {
      return;
    }

    const now = new Date();
    const nextMinute = nextMinuteBoundary(now);

    cx.jobTimer = setTimeout(() => {
      // 定时器已经触发，句柄作废；stop 时靠它判断是否还有待触发的定时器
      cx.jobTimer = null;

      // 到点时状态可能已经变了（stop / pause）
      if (cx.jobState !== CronjobState.Running) {
        return;
      }

      //! 定时器可能早于边界触发，相当于等了但还没等到呢，再等一会
      if (Date.now() < nextMinute.getTime()) {
        schedule();
        return;
      }

      const noSecondDate = new Date();
      noSecondDate.setSeconds(0, 0);
      fn(noSecondDate);
      schedule();
    }, nextMinute.getTime() - now.getTime());
  };

  schedule();

  return {
    stop() {
      if (cx.jobTimer) {
        clearTimeout(cx.jobTimer);
        cx.jobTimer = null;
      }
      cx.jobState = CronjobState.Stopped;
    },
    pause() {
      if (cx.jobState === CronjobState.Running) {
        cx.jobState = CronjobState.Paused;
      }
    },
    resume() {
      if (cx.jobState === CronjobState.Stopped) {
        return;
      }
      cx.jobState = CronjobState.Running;
      // 暂停期间定时器没有停，所以这里只需要恢复状态即可；
      // 但如果定时器已经被外部清掉（jobTimer === null），重新排一次
      if (cx.jobTimer === null) {
        schedule();
      }
    },
  };
}
