import { extname } from 'node:path';
import { isValid } from 'cron-fast';
import { Marker } from '../consts.js';
import { log } from '../utils.js';
import { getAllowFn, getShebang } from './allow.js';

/**
 * 从一行文本中提取带标记的 cron 表达`式
 *
 * @param trimmed 已经去掉前导空格的行文本
 * @param inBlock 是否在 @cronbegin 和 @cronend 块中
 * @param filepath 文件路径，用于日志输出
 */
export function extractCron(trimmed: string, inBlock: boolean, filepath: string): string | null {
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

  return isValid(exp) ? exp : null;
}

interface JobItem {
  /**
   * key    分组编号，同一个分组只要一个匹配即可运行，只运行一次
   * value  cron表达式数组
   */
  map: Map<number, string[]>;

  /**
   * 有可能从文件中解析出 shebang
   */
  shebang: string | null;
}

export const getOrInsert = (map: Map<any, any[]>, key: any): any[] => {
  if (!map.has(key)) {
    map.set(key, []);
  }
  return map.get(key)!;
};

/**
 * 读取文件中符合注释后加cron表达式的表达式
 */
export function getCronExps(filepath: string, lines: string[]): JobItem | null {
  const allowFn = getAllowFn(extname(filepath));

  if (lines.length === 0) {
    return null;
  }

  const shebang = getShebang(lines[0]);

  if (shebang) {
    lines.shift();
  }

  if (lines.length === 0) {
    return null;
  }

  // 第一行放行shebang
  const firstNotAllowedIndex = lines.findIndex((v) => !allowFn(v));
  if (firstNotAllowedIndex !== -1) {
    // 切除到第一行正式代码为止，上面的都可以用来记录@cron
    lines = lines.slice(0, firstNotAllowedIndex);
  }

  if (lines.length === 0) {
    return null;
  }

  // TODO 这里应该改为：shebang只传一次，用map，0->[exp,exp]
  const map = new Map<number, string[]>();

  let inCronBlock = false;
  let group = 0;
  for (const line of lines) {
    const exp = extractCron(line, inCronBlock, filepath);
    if (!exp) {
      continue;
    }

    if (exp === Marker.BEGIN) {
      // 语法错误不予解析
      if (inCronBlock) {
        log(`Error: Nested ${Marker.BEGIN} found in file: ${filepath}`);
        return null;
      }
      group++;
      inCronBlock = true;
      continue;
    }

    if (exp === Marker.END) {
      // 语法错误不予解析
      if (!inCronBlock) {
        log(`Error: ${Marker.END} didn't match ${Marker.BEGIN} in file: ${filepath}`);
        return null;
      }
      inCronBlock = false;
      continue;
    }

    getOrInsert(map, 0).push(exp);
  }

  // 语法错误不予解析
  if (inCronBlock) {
    log(`Error: Unclosed ${Marker.BEGIN}/${Marker.END} block in file: ${filepath}`);
    return null;
  }

  return { map, shebang };
}
