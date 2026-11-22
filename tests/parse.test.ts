import { describe, expect, it } from 'vitest';

import { matches, parseExp } from '../src/cron/parse.js';
import { createTestContext } from './helpers.js';

const { cx } = createTestContext({ timezone: 'Asia/Shanghai' });

/** 用上海时间构造时刻，避免测试里到处写 UTC */
const sh = (iso: string) => new Date(iso);

/**
 * 2026-11-21 是周六，2026-11-23 是周一，2026-11-30 是当月最后一天。
 * 上海 = UTC+8，所以 09:00 +08:00 = 01:00Z。
 */
const CASES: Array<[exp: string, local: string, expected: boolean]> = [
  ['0 9 * * *', '2026-11-21T09:00:00+08:00', true],
  ['0 9 * * *', '2026-11-21T09:01:00+08:00', false],
  ['0 9 * * *', '2026-11-21T01:00:00Z', true], // 换成 UTC 表示仍是上海 09:00
  ['0 9 * * *', '2026-11-21T09:00:00Z', false], // 上海 17:00
  ['0 9 L * *', '2026-11-30T09:00:00+08:00', true],
  ['0 9 L * *', '2026-11-21T09:00:00+08:00', false],
  ['0 9 24 * 1', '2026-11-23T09:00:00+08:00', true], // 周一
  ['0 9 24 * 1', '2026-11-24T09:00:00+08:00', true], // 24 号，dom/dow 取或
  ['0 9 24 * 1', '2026-11-25T09:00:00+08:00', false],
  ['30 18 * * 1-5', '2026-11-23T18:30:00+08:00', true], // 周一
  ['30 18 * * 1-5', '2026-11-21T18:30:00+08:00', false], // 周六
];

/** parseExp 的第三参数，这里固定一个路径即可 */
const FILE = '/virtual/dir/x.js';

describe('parseExp', () => {
  it('returns null for invalid expressions instead of throwing', () => {
    expect(parseExp(cx, '60 9 * * *', FILE)).toBeNull();
    expect(parseExp(cx, 'not a cron', FILE)).toBeNull();
    expect(parseExp(cx, '   ', FILE)).toBeNull();
  });

  it('documents that cron-parser treats "" as "* * * * *"', () => {
    // 调用方（extract）要求至少 5 段，所以不会把空串喂进来；
    // 这里固定住这个上游行为，避免以后误以为 parseExp 会挡住空串。
    expect(parseExp(cx, '', FILE)!.stringify()).toBe('* * * * *');
  });

  it('parses a valid 5-field expression', () => {
    const exp = parseExp(cx, '0 9 * * 1-5', FILE);
    expect(exp).not.toBeNull();
    expect(exp!.stringify()).toBe('0 9 * * 1-5');
  });

  it('seeds H from filepath, so the same file picks the same slot every tick', () => {
    // runner 每分钟重新 parse 一次；不传 hashSeed 时 H 每次随机，会变成"有时一秒内跑多次、有时不跑"
    const minuteOf = (fp: string) => parseExp(cx, 'H * * * *', fp)!.fields.minute.values;
    const runs = Array.from({ length: 5 }, () => minuteOf('/virtual/dir/a.js'));
    for (const r of runs) expect(r).toEqual(runs[0]);
    // 不同文件各自取到的槽位不同（同 seed 才会相同）
    expect(minuteOf('/virtual/dir/b.js')).not.toEqual(runs[0]);
  });
});

describe('matches', () => {
  it.each(CASES)('%s at %s → %s', (exp, local, expected) => {
    const parsed = parseExp(cx, exp, FILE);
    expect(parsed).not.toBeNull();
    expect(matches(parsed!, sh(local))).toBe(expected);
  });

  it('compares the second field too, so callers must truncate to the minute', () => {
    const parsed = parseExp(cx, '0 9 * * *', FILE)!;
    expect(matches(parsed, sh('2026-11-21T09:00:00+08:00'))).toBe(true);
    // 09:00:59 的“秒”不为 0，includesDate 直接判 false —— 这也是 task 里先 setSeconds(0,0) 的原因
    expect(matches(parsed, sh('2026-11-21T09:00:59+08:00'))).toBe(false);
  });

  it('respects the context timezone', () => {
    const utc = createTestContext({ timezone: 'UTC' }).cx;
    const parsed = parseExp(utc, '0 9 * * *', FILE)!;
    expect(matches(parsed, sh('2026-11-21T09:00:00Z'))).toBe(true);
    expect(matches(parsed, sh('2026-11-21T01:00:00Z'))).toBe(false);
  });
});
