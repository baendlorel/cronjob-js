import type { CronGroupItem, JobItem } from '../types/job.js';
import type { CronExpression } from 'cron-parser';
import type { CronjobConfig } from '../config.js';

import { extname } from 'node:path';
import { type CronBlockMaker, Marker } from '../consts.js';
import { parseExp } from '../cron/parse.js';
import { log } from '../utils.js';
import { getDefaultInterpreter } from '../interpreter.js';
import { getAllowFn } from './allow.js';
import { getShebang } from './shebang.js';

/**
 * 从一行文本中提取带标记的 cron 表达式
 * - 只接受5位表达式，不支持秒级
 *
 * @param trimmedLine 已经去掉前导空格的行文本
 * @param inBlock 是否在 @cronbegin 和 @cronend 块中
 * @param filepath 文件路径，用于日志输出
 */
export function extractCron(
  config: CronjobConfig,
  trimmedLine: string,
  inBlock: boolean,
  filepath: string,
): CronExpression | CronBlockMaker | null {
  if (trimmedLine.search(Marker.BEGIN_REGEX) !== -1) {
    return Marker.BEGIN;
  }
  if (trimmedLine.search(Marker.END_REGEX) !== -1) {
    return Marker.END;
  }

  // 可以确保到此为止的都是注释，且trim过
  const markerIndex = trimmedLine.search(Marker.CRON_REGEX);
  if (markerIndex === -1) {
    if (inBlock) {
      //! 因为js多行注释会导致"*"开头的行被误认为cron表达式的一部分
      log(`@cron should be used to mark cron expressions in cron blocks: ${filepath}`);
    }
    return null;
  }

  // 直接切片，从@cron后面开始获取字符
  const tokens = trimmedLine
    .slice(markerIndex + Marker.CRON.length)
    .split(/\s+/)
    .filter(Boolean);

  //! 不支持6个位的
  const sixExpStr = tokens.slice(0, 6).join(' ');
  const sixExp = parseExp(config, sixExpStr);
  if (!sixExp) {
    log(`Error: Invalid six-field cron expression: ${sixExpStr}`);
  }

  // 直接返回5位的解析结果
  return parseExp(config, tokens.slice(0, 5).join(' '));
}

/**
 * 从文件内容提取带标记的 cron 表达式，并组合成`JobItem`，一次性提供
 * cron表达式对象、分组信息、文件路径以及解释器信息
 *
 * @param filepath 文件路径，用于日志输出
 * @param lines 文件内容的每一行
 */
export function getJobItem(config: CronjobConfig, filepath: string, lines: string[]): JobItem | null {
  const ext = extname(filepath);
  const allowFn = getAllowFn(ext);

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

  const list: CronGroupItem[] = [];

  let inCronBlock = false;
  let group = 0;
  for (const line of lines) {
    const cron = extractCron(config, line, inCronBlock, filepath);
    // 忽略空的
    if (!cron) {
      continue;
    }

    if (cron === Marker.BEGIN) {
      // 已经在快中，再次碰到begin，则语法错误不予解析
      if (inCronBlock) {
        log(`Error: Nested ${Marker.BEGIN} found in file: ${filepath}`);
        return null;
      }
      group++;
      inCronBlock = true;
      continue;
    }

    if (cron === Marker.END) {
      // 并不在块中，却直接碰到end，语法错误不予解析
      if (!inCronBlock) {
        log(`Error: ${Marker.END} didn't match ${Marker.BEGIN} in file: ${filepath}`);
        return null;
      }
      inCronBlock = false;
      continue;
    }

    list.push({ cron, group: inCronBlock ? group : 0 });
  }

  // 语法错误不予解析
  if (inCronBlock) {
    log(`Error: Unclosed ${Marker.BEGIN}/${Marker.END} block in file: ${filepath}`);
    return null;
  }

  const interpreter = shebang ?? getDefaultInterpreter(ext);

  return { flatCronGroups: list, interpreter, filepath };
}
