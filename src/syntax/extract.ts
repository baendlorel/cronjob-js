import type { CronExpression } from 'cron-parser';
import type { CronGroupItem, JobItem } from '../types/global.js';
import type { CronjobContext } from '../types/config.js';

import { extname, relative } from 'node:path';
import { type CronBlockMaker, Marker } from '../consts.js';
import { parseExp } from '../cron/parse.js';
import { getDefaultInterpreter } from '../interpreter.js';
import { getAllowFn } from './allow.js';
import { getShebang } from './shebang.js';

/**
 * 一行解析出来的调度：表达式 + 它实际使用的时区。
 * 时区只在这里决定一次，调用方不要再对整行做第二次标记搜索（F45）。
 */
export interface ExtractedCron {
  cron: CronExpression;
  timezone: string;
}

/**
 * 从一行文本中提取带标记的 cron 表达式
 * - 只接受5位表达式，不支持秒级
 * - `@cronutc <5 段>` 是行内指令：这一条按 UTC 解析，不影响其它行
 *
 * @param trimmedLine 已经去掉前导空格的行文本
 * @param inBlock 是否在 @cronbegin 和 @cronend 块中
 * @param relativePath 相对路径，用于日志输出
 */
export function extractCron(
  cx: CronjobContext,
  trimmedLine: string,
  inBlock: boolean,
  relativePath: string,
): ExtractedCron | CronBlockMaker | null {
  if (trimmedLine.search(Marker.BEGIN_REGEX) !== -1) {
    return Marker.BEGIN;
  }
  if (trimmedLine.search(Marker.END_REGEX) !== -1) {
    return Marker.END;
  }

  // @cron的index
  const index = trimmedLine.search(Marker.REGEX);
  // @cronutc的index
  const utcIndex = trimmedLine.search(Marker.UTC_REGEX);

  // 同一行两个标记无法判断该按哪个时区跑；宁可拒绝并记 Error，也不猜
  if (index !== -1 && utcIndex !== -1) {
    cx.log.err(`Line contains both ${Marker.CRON} and ${Marker.UTC}, nothing scheduled: ${relativePath}`);
    return null;
  }

  let timezone = cx.timezone;
  let expStart = -1;

  // 一般都是这个，所以这个排前面，分支预测更好
  if (index !== -1) {
    expStart = index + Marker.CRON.length;
  } else if (utcIndex !== -1) {
    timezone = 'UTC';
    expStart = utcIndex + Marker.UTC.length;
  }

  if (expStart === -1) {
    if (inBlock) {
      cx.log.warn(`@cron should be used to mark cron expressions in cron blocks: ${relativePath}`);
    }
    return null;
  }

  // 直接切片，从标记后面开始获取字符
  const tokens = trimmedLine.slice(expStart).split(/\s+/).filter(Boolean);

  //! 阻止cron-parser 把 4 段自动补齐成另一条合法表达式
  if (tokens.length < 5) {
    cx.log.err(`Invalid cron expression: "${tokens.join(' ')}" in file: ${relativePath}`);
    return null;
  }

  // 前 6 段能解析说明写的是秒级定时，本项目只支持 5 段，整行不调度
  if (tokens.length >= 6) {
    const sixExpStr = tokens.slice(0, 6).join(' ');
    if (parseExp(cx, sixExpStr, relativePath, timezone)) {
      cx.log.err(`6 fields cron is not supported, use 5 fields instead. Found "${sixExpStr}" in file: ${relativePath}`);
      return null;
    }
  }

  // 取前 5 段，之后是说明文字
  const cron = parseExp(cx, tokens.slice(0, 5).join(' '), relativePath, timezone);
  return cron ? { cron, timezone } : null;
}

/**
 * 从文件内容提取带标记的 cron 表达式，并组合成`JobItem`，一次性提供
 * cron表达式对象、分组信息、文件路径以及解释器信息
 *
 * @param filepath 文件路径，用于日志输出
 * @param content 文件头内容（可以是整文件；第一行正式代码之后的不会用到）
 */
export function getJobItem(cx: CronjobContext, filepath: string, content: string): JobItem | null {
  const ext = extname(filepath);
  const allowFn = getAllowFn(ext);

  let lines = content.split('\n').map((line) => line.trim());

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
  // 主日志统一用相对路径（CLAUDE.md 约定）
  const relativePath = relative(cx.dir, filepath);

  let inCronBlock = false;
  let group = 0;
  for (const line of lines) {
    const extracted = extractCron(cx, line, inCronBlock, relativePath);
    // 忽略空的
    if (!extracted) {
      continue;
    }

    if (extracted === Marker.BEGIN) {
      // 已经在快中，再次碰到begin，则语法错误不予解析
      if (inCronBlock) {
        cx.log.err(`Nested ${Marker.BEGIN} found in file: ${relativePath}`);
        return null;
      }
      group++;
      inCronBlock = true;
      continue;
    }

    if (extracted === Marker.END) {
      // 并不在块中，却直接碰到end，语法错误不予解析
      if (!inCronBlock) {
        cx.log.err(`${Marker.END} didn't match ${Marker.BEGIN} in file: ${relativePath}`);
        return null;
      }
      inCronBlock = false;
      continue;
    }

    // 时区跟着解析结果走：@cron 与 @cronutc 同时出现时标记不匹配的错误已在 extractCron 里拦下
    list.push({ ...extracted, group: inCronBlock ? group : 0 });
  }

  // 语法错误不予解析
  if (inCronBlock) {
    cx.log.err(`Unclosed ${Marker.BEGIN}/${Marker.END} block in file: ${relativePath}`);
    return null;
  }

  const interpreter = shebang ?? getDefaultInterpreter(ext);

  return { flatCronGroups: list, interpreter, filepath };
}
