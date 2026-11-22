import type { CronGroupItem, JobItem } from '../types/job.js';
import type { CronExpression } from 'cron-parser';
import type { CronjobContext } from '../config.js';

import { extname } from 'node:path';
import { type CronBlockMaker, Marker } from '../consts.js';
import { parseExp } from '../cron/parse.js';
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
  cx: CronjobContext,
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
      cx.log.warn(`@cron should be used to mark cron expressions in cron blocks: ${filepath}`);
    }
    return null;
  }

  // 直接切片，从@cron后面开始获取字符
  const tokens = trimmedLine
    .slice(markerIndex + Marker.CRON.length)
    .split(/\s+/)
    .filter(Boolean);

  // cron-parser 会把 4 段自动补齐成另一条合法表达式，必须在 parse 之前挡住
  if (tokens.length < 5) {
    cx.log.err(`Invalid cron expression: "${tokens.join(' ')}" in file: ${filepath}`);
    return null;
  }

  // 前 6 段能解析说明写的是秒级定时，本项目只支持 5 段，整行不调度
  if (tokens.length >= 6) {
    const sixExpStr = tokens.slice(0, 6).join(' ');
    if (parseExp(cx, sixExpStr, filepath)) {
      cx.log.err(`Seconds-level cron is not supported, use 5 fields instead: "${sixExpStr}" in file: ${filepath}`);
      return null;
    }
  }

  // 取前 5 段，之后是说明文字
  return parseExp(cx, tokens.slice(0, 5).join(' '), filepath);
}

/**
 * 从文件内容提取带标记的 cron 表达式，并组合成`JobItem`，一次性提供
 * cron表达式对象、分组信息、文件路径以及解释器信息
 *
 * @param filepath 文件路径，用于日志输出
 * @param lines 文件内容的每一行
 */
export function getJobItem(cx: CronjobContext, filepath: string, lines: string[]): JobItem | null {
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
    const cron = extractCron(cx, line, inCronBlock, filepath);
    // 忽略空的
    if (!cron) {
      continue;
    }

    if (cron === Marker.BEGIN) {
      // 已经在快中，再次碰到begin，则语法错误不予解析
      if (inCronBlock) {
        cx.log.err(`Nested ${Marker.BEGIN} found in file: ${filepath}`);
        return null;
      }
      group++;
      inCronBlock = true;
      continue;
    }

    if (cron === Marker.END) {
      // 并不在块中，却直接碰到end，语法错误不予解析
      if (!inCronBlock) {
        cx.log.err(`${Marker.END} didn't match ${Marker.BEGIN} in file: ${filepath}`);
        return null;
      }
      inCronBlock = false;
      continue;
    }

    list.push({ cron, group: inCronBlock ? group : 0 });
  }

  // 语法错误不予解析
  if (inCronBlock) {
    cx.log.err(`Unclosed ${Marker.BEGIN}/${Marker.END} block in file: ${filepath}`);
    return null;
  }

  const interpreter = shebang ?? getDefaultInterpreter(ext);

  return { flatCronGroups: list, interpreter, filepath };
}
