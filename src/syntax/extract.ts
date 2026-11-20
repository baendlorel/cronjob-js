import cron from 'node-cron';
import { Marker } from '../consts.js';
import { log } from '../utils.js';

/**
 * 从一行文本中提取带标记的 cron 表达式
 *
 * @param trimmed 已经去掉前导空格的行文本
 * @param inBlock 是否在 @cronbegin 和 @cronend 块中
 * @param filepath 文件路径，用于日志输出
 */
export const extractCron = (
  trimmed: string,
  inBlock: boolean,
  filepath: string,
): (string & {}) | '@cronbegin' | '@cronend' | null => {
  if (trimmed.search(Marker.BEGIN_REGEX) !== -1) {
    return Marker.BEGIN;
  }
  if (trimmed.search(Marker.END_REGEX) !== -1) {
    return Marker.END;
  }

  // 可以确保到此为止的都是注释，且trim过
  const markerIndex = trimmed.search(Marker.CRON_REGEX);
  if (markerIndex === -1) {
    if (inBlock) {
      //! 因为js多行注释会导致"*"开头的行被误认为cron表达式的一部分
      log(`@cron should be used to mark cron expressions in cron blocks: ${filepath}`);
    }
    return null;
  }

  // 直接切片，从@cron后面开始获取字符
  const exp = trimmed.slice(markerIndex + Marker.CRON.length);

  return cron.validate(exp) ? exp : null;
};
