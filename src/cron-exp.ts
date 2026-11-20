import { readFileSync } from 'node:fs';
import { isMatch, isValid, nextRun, previousRun } from 'cron-fast';
import { log } from './utils.js';
import { consts, CronMarker } from './consts.js';
import { extname } from 'node:path';

/**
 * @typedef {Object} ExtractedCron
 * @property {string[]} tokens   - 解析出的 token 列表
 * @property {string} exp - 疑似 cron 表达式的字符串列表
 */

/**
 * 从一行文本中提取带标记的 5 段 cron
 *
 * 只认注释后面的“@cron 分 时 日 月 周”
 * 标记后的前 5 个 token 必须能通过 isValid，不做滑动窗口匹配，
 * 避免说明文字里偶然出现的 5 个数字被误当成 cron（例如“分片 1 2 3 4 5 已确认”）。
 *
 * @param {string} trimmed  - 已经去掉前导空格的行文本
 * @param {boolean} inBlock  - 是否在 @cronbegin 和 @cronend 块中
 * @param {string} filepath       - 文件路径，用于日志输出
 * @returns {ExtractedCron | "@cronbegin"| "@cronend" | null} 不是 cron 行返回 null
 */
export const extractCron = (trimmed, inBlock, filepath) => {
  if (trimmed.search(CronMarker.BEGIN_REGEX) !== -1) {
    return CronMarker.BEGIN;
  }
  if (trimmed.search(CronMarker.END_REGEX) !== -1) {
    return CronMarker.END;
  }

  // 可以确保到此为止的都是注释，且trim过
  const markerIndex = trimmed.search(CronMarker.CRON_REGEX);
  if (markerIndex === -1) {
    if (inBlock) {
      log(`@cron marker is needed in cron blocks to avoid ambiguity like "
/**
 * @cronbegin
 *  2 * * * *
 * @cronend
 */
"
This could be interpreted as "* 2 * * * *" or "2 * * * *" which both make sense: ${filepath}`);
    }
    return null;
  }

  const startIndex = markerIndex + CronMarker.CRON.length;

  // 直接切片，从@cron后面开始获取字符
  const tokens = trimmed.slice(startIndex).split(/\s+/).filter(Boolean);

  if (tokens.length < 5) {
    return null;
  }

  const exp = tokens.slice(0, 5).join(' ');
  if (!isValid(exp)) {
    return null;
  }

  return { tokens, exp };
};

/**
 * @typedef {Object} CronExpItem
 * @property {number}  group   分组编号，同一个分组只要一个匹配即可运行，只运行一次
 * @property {boolean} dev     是否开发模式
 * @property {string[]} tokens 字符段列表
 * @property {string}  exp     cron表达式
 */

/**
 * 读取文件中符合注释后加cron表达式的表达式
 * @param {string} filepath
 * @return {CronExpItem[] | null}
 */
export const getCronExps = (filepath) => {
  try {
    const allowFn = getAllowFn(extname(filepath));

    let lines = readFileSync(filepath, 'utf8')
      .split('\n')
      .map((v) => v.trimStart());

    // TODO 这里要解读出shebang里的解释器
    // 第一行放行shebang
    const firstNotAllowedIndex = lines.findIndex((v, i) => (i === 0 ? !shebangAllow(v) && !allowFn(v) : !allowFn(v)));
    if (firstNotAllowedIndex !== -1) {
      // 切除到第一行正式代码为止，上面的都可以用来记录@cron
      lines = lines.slice(0, firstNotAllowedIndex);
    }

    const list = [];
    /**
     * @type {boolean}
     */
    let inCronBlock = false;
    let group = 0;
    for (const line of lines) {
      const extracted = extractCron(line, inCronBlock, filepath);
      if (!extracted) {
        continue;
      }

      if (extracted === CronMarker.BEGIN) {
        // 语法错误不予解析
        if (inCronBlock) {
          log(`Error: Nested ${CronMarker.BEGIN} found in file: ${filepath}`);
          return null;
        }
        group++;
        inCronBlock = true;
        continue;
      }

      if (extracted === CronMarker.END) {
        // 语法错误不予解析
        if (!inCronBlock) {
          log(`Error: ${CronMarker.END} didn't match ${CronMarker.BEGIN} in file: ${filepath}`);
          return null;
        }
        inCronBlock = false;
        continue;
      }

      list.push({
        ...extracted,
        group: inCronBlock ? group : 0,
        dev: extracted.tokens.includes(consts.DEV_FLAG),
      });
    }

    // 语法错误不予解析
    if (inCronBlock) {
      log(`Error: Unclosed ${CronMarker.BEGIN}/${CronMarker.END} block in file: ${filepath}`);
      return null;
    }

    return list;
  } catch (e) {
    log(filepath, e);
    return null;
  }
};

/**
 * 判断文件本轮是否该运行
 *
 * @param {string} filepath
 * @param {Date} now
 * @returns 要跑的 cron，是否dev模式，以及要跑多少次；
 *   文件读不了、没有合法 cron 时返回 undefined
 */
export const shouldRun = (filepath, now) => {
  const list = getCronExps(filepath);
  if (!list) {
    return undefined;
  }

  if (list.length === 0) {
    log(`No valid cron expression found in file: ${filepath}`);
    return undefined;
  }

  const runList = [];
  list
    .filter((v) => matchTime(v.exp, now).matched)
    .forEach((item) => {
      if (item.group === 0) {
        runList.push(item);
        return;
      }

      if (!runList.some((v) => v.group === item.group)) {
        runList.push(item);
      }
    });

  return runList;
};

/**
 * 判定本轮是否该运行
 *
 * @param {string} exp
 * @param {Date} now 本轮开始的时间
 * @returns {{ matched: boolean, next: Date }}
 */
export const matchTime = (exp, now) => {
  const opts = { timezone: consts.timezone, from: now };
  return {
    matched: isMatch(exp, now, opts),
    next: nextRun(exp, opts),
  };
};

/**
 * @deprecated 现在极简化处理，不再需要
 *
 * 旧的匹配方式，保留备查：判断 now 距离上次/下次是否在容差内。
 *
 * 缺点：容差只有 200ms，且基于 node-cron 恰好在 0 秒触发的假设，晚触发即漏跑。
 * @param {string} exp
 * @param {Date} now
 */
export const oldMatchTime = (exp, now) => {
  const res = {
    prev: previousRun(exp, { timezone: consts.timezone, from: now }),
    next: nextRun(exp, { timezone: consts.timezone, from: now }),
    matched: false,
  };
  res.matched = tolerant(now, res.prev) || tolerant(now, res.next);
  return res;
};

/**
 * 时间容差
 */
const tolerant = (time1, time2, threshold = consts.时间容差) => {
  return Math.abs(time1.getTime() - time2.getTime()) < threshold;
};
