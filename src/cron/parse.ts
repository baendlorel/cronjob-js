import type { CronjobConfig } from '../config.js';
import { type CronExpression, CronExpressionParser } from 'cron-parser';

/**
 * 非得要try很奇怪，但这是官方推荐的方式
 */
export const parseExp = (exp: string): CronExpression | null => {
  try {
    return CronExpressionParser.parse(exp);
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
  const fields = expression.fields;

  // 逐字段比对。注意 month 需要 +1，dayOfWeek 用 getDay()
  // 对于 5 字段表达式（无秒），fields.second 可能不存在或为空，此时跳过秒的判断
  return (
    fields.minute.values.includes(d.getMinutes() as any) &&
    fields.hour.values.includes(d.getHours() as any) &&
    fields.dayOfMonth.values.includes(d.getDate() as any) &&
    fields.month.values.includes((d.getMonth() + 1) as any) &&
    fields.dayOfWeek.values.includes(d.getDay() as any)
  );
}
