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
 * @param  date 待匹配的日期
 */
export function matches(config: CronjobConfig, expression: CronExpression, date: Date) {
  const interval = CronExpressionParser.parse(expression, { timezone: config.timezone });
  const fields = interval.fields;

  // 逐字段比对。注意 month 需要 +1，dayOfWeek 用 getDay()
  // 对于 5 字段表达式（无秒），fields.second 可能不存在或为空，此时跳过秒的判断
  if (fields.second && fields.second.length > 0 && !fields.second.includes(date.getSeconds())) {
    return false;
  }
  if (!fields.minute.includes(date.getMinutes())) return false;
  if (!fields.hour.includes(date.getHours())) return false;
  if (!fields.dayOfMonth.includes(date.getDate())) return false;
  if (!fields.month.includes(date.getMonth() + 1)) return false;
  if (!fields.dayOfWeek.includes(date.getDay())) return false;

  return true;
}
