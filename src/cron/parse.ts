import type { CronjobContext } from '../config.js';
import { type CronExpression, CronExpressionParser } from 'cron-parser';

/**
 * 非得要try很奇怪，但这是官方推荐的方式
 *
 * @param timezone cron 语义使用的时区；默认是 cx.timezone，`@cronutc` 之后传 'UTC'
 */
export const parseExp = (
  cx: CronjobContext,
  exp: string,
  filepath: string,
  timezone: string = cx.timezone,
): CronExpression | null => {
  try {
    return CronExpressionParser.parse(exp, { tz: timezone, hashSeed: filepath });
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
