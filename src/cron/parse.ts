import type { CronjobContext } from '../config.js';
import { type CronExpression, CronExpressionParser } from 'cron-parser';

/**
 * 非得要try很奇怪，但这是官方推荐的方式
 */
export const parseExp = (cx: CronjobContext, exp: string): CronExpression | null => {
  try {
    return CronExpressionParser.parse(exp, { tz: cx.timezone });
  } catch {
    return null;
  }
};

/**
 * 判断给定日期是否匹配 cron 表达式
 * @param  expression cron 表达式
 * @param  d 待匹配的日期
 */
export function matches(expression: CronExpression, d: Date) {
  // & 已经在task里面完成了这一步：d.setSeconds(0, 0);
  return expression.includesDate(d);
}
