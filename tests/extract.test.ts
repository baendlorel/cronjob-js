import { describe, expect, it } from 'vitest';

import { Tag } from '../src/consts.js';
import { loadRuntime } from '../src/interpreter.js';
import { getJobItem } from '../src/syntax/extract.js';
import { createTestContext, logsOf } from './helpers.js';

// 解释器映射现在由 cronjob() 启动时探测；纯函数测试里显式加载一次
loadRuntime();

const item = (content: string, filepath = '/virtual/dir/x.js', ctx = createTestContext()) => {
  const { cx, logs } = ctx;
  return { item: getJobItem(cx, filepath, content), logs, cx };
};

const expsOf = (content: string) => {
  const { item: job } = item(content);
  return job?.flatCronGroups.map((g) => ({ exp: g.cron.stringify(), group: g.group }));
};

describe('getJobItem — 头部识别', () => {
  it('returns an empty item for an empty file', () => {
    const { item: job, logs } = item('');
    expect(job!.flatCronGroups).toEqual([]);
    expect(logs).toHaveLength(0);
  });

  it('returns null when the file is only a shebang', () => {
    expect(item('#!/usr/bin/env node').item).toBeNull();
  });

  it('returns null when the first line is already code', () => {
    // 头部为空，没有任何可扫描的注释区
    expect(item('const x = 1;').item).toBeNull();
  });

  it('stops scanning at the first line of real code', () => {
    // 代码之后的注释不属于头部，不该被调度
    expect(expsOf(['// @cron * * * * *', 'const x = 1;', '// @cron 0 9 * * *'].join('\n'))).toEqual([
      { exp: '* * * * *', group: 0 },
    ]);
  });

  it('does not stop at blank lines inside the header', () => {
    expect(expsOf(['// @cron * * * * *', '', '', '// @cron 0 9 * * *', 'console.log(1)'].join('\n'))).toEqual([
      { exp: '* * * * *', group: 0 },
      { exp: '0 9 * * *', group: 0 },
    ]);
  });

  it('handles a shebang then header comments', () => {
    const { item: job } = item('#!/bin/bash\n# @cron 0 3 * * *\necho hi', '/virtual/dir/x.sh');
    expect(job).toMatchObject({
      interpreter: { cmd: '/bin/bash', args: [] },
      filepath: '/virtual/dir/x.sh',
    });
    expect(job!.flatCronGroups.map((g) => g.cron.stringify())).toEqual(['0 3 * * *']);
  });

  it('supports a /** */ header block', () => {
    expect(
      expsOf(['/**', ' * @cron 0 9 * * 1-5 工作日', ' */', 'console.log(1)'].join('\n')),
    ).toEqual([{ exp: '0 9 * * 1-5', group: 0 }]);
  });
});

describe('getJobItem — 表达式解析', () => {
  it('takes the first 5 fields and ignores the trailing note', () => {
    expect(expsOf('// @cron 0 9 * * * 每天九点')).toEqual([{ exp: '0 9 * * *', group: 0 }]);
  });

  it('accepts fields like L and dom/dow OR syntax', () => {
    expect(expsOf('// @cron 0 9 L * *')).toEqual([{ exp: '0 9 L * *', group: 0 }]);
    expect(expsOf('// @cron 0 9 24 * 1')).toEqual([{ exp: '0 9 24 * 1', group: 0 }]);
  });

  it('rejects fewer than 5 fields without letting cron-parser pad them', () => {
    const { item: job, logs } = item('// @cron 0 9 * *');
    expect(job!.flatCronGroups).toEqual([]);
    expect(logsOf(logs, Tag.Error)).toHaveLength(1);
    expect(logsOf(logs, Tag.Error)[0].args[0]).toContain('Invalid cron expression');
  });

  it('rejects empty expressions', () => {
    const { item: job, logs } = item('// @cron');
    expect(job!.flatCronGroups).toEqual([]);
    expect(logsOf(logs, Tag.Error)).toHaveLength(1);
  });

  it('rejects 6-field second-level expressions', () => {
    const { item: job, logs } = item('// @cron 0 0 9 * * *');
    expect(job!.flatCronGroups).toEqual([]);
    expect(logsOf(logs, Tag.Error)[0].args[0]).toContain('6 fields cron is not supported');
  });

  it('rejects */5 * * * * * (6 fields with a step)', () => {
    const { item: job, logs } = item('// @cron */5 * * * * *');
    expect(job!.flatCronGroups).toEqual([]);
    expect(logsOf(logs, Tag.Error)).toHaveLength(1);
  });

  it('does not misreport a 5-field expression followed by a word as seconds-level', () => {
    const { item: job, logs } = item('// @cron 0 9 * * * 每天九点');
    expect(job!.flatCronGroups).toHaveLength(1);
    expect(logs).toHaveLength(0);
  });

  it('silently ignores an invalid 5-field expression (parse returns null)', () => {
    const { item: job } = item('// @cron 60 9 * * *');
    expect(job!.flatCronGroups).toEqual([]);
  });

  it('returns null for a line with @cron that has no expression', () => {
    const { item: job } = item('// just a note with @cron in the middle of nowhere');
    expect(job!.flatCronGroups).toEqual([]);
  });
});

describe('getJobItem — @cronutc', () => {
  const tzsOf = (content: string) => {
    const { item: job } = item(content);
    return job?.flatCronGroups.map((g) => g.timezone);
  };

  it('applies UTC only to the line it is on', () => {
    expect(tzsOf(['// @cron 0 9 * * *', '// @cronutc 0 9 * * *', '// @cron 0 9 * * *'].join('\n'))).toEqual([
      'Asia/Shanghai',
      'UTC',
      'Asia/Shanghai',
    ]);
  });

  it('is a schedule itself, not a standalone switch', () => {
    const { item: job, logs } = item(['// @cronutc 0 9 * * *'].join('\n'));
    expect(job!.flatCronGroups).toHaveLength(1);
    expect(job!.flatCronGroups[0]).toMatchObject({ group: 0, timezone: 'UTC' });
    expect(job!.flatCronGroups[0].cron.stringify()).toBe('0 9 * * *');
    expect(logs).toHaveLength(0);
  });

  it('works inside a block and keeps the block group', () => {
    const { item: job } = item(['// @cronbegin', '// @cronutc 0 9 * * *', '// @cron 0 9 * * *', '// @cronend'].join('\n'));
    expect(job!.flatCronGroups.map((g) => [g.group, g.timezone])).toEqual([
      [1, 'UTC'],
      [1, 'Asia/Shanghai'],
    ]);
  });

  it('tolerates trailing words after the expression', () => {
    expect(tzsOf('// @cronutc 0 9 * * * 每天 UTC 九点')).toEqual(['UTC']);
  });
});

describe('getJobItem — 分组', () => {
  it('keeps block-outside lines independent (group 0)', () => {
    expect(expsOf(['// @cron 0 9 * * *', '// @cron 0 21 * * *'].join('\n'))).toEqual([
      { exp: '0 9 * * *', group: 0 },
      { exp: '0 21 * * *', group: 0 },
    ]);
  });

  it('assigns the same group number to lines inside a block', () => {
    expect(
      expsOf(
        ['// @cronbegin', '// @cron 0 9 * * 1-5', '// @cron 0 9 * * 6', '// @cronend'].join('\n'),
      ),
    ).toEqual([
      { exp: '0 9 * * 1-5', group: 1 },
      { exp: '0 9 * * 6', group: 1 },
    ]);
  });

  it('resets to group 0 after a block closes', () => {
    expect(
      expsOf(
        [
          '// @cronbegin',
          '// @cron 0 9 * * *',
          '// @cronend',
          '// @cron 0 21 * * *',
        ].join('\n'),
      ),
    ).toEqual([
      { exp: '0 9 * * *', group: 1 },
      { exp: '0 21 * * *', group: 0 },
    ]);
  });

  it('numbers multiple blocks incrementally', () => {
    expect(
      expsOf(
        [
          '// @cronbegin',
          '// @cron 0 9 * * *',
          '// @cronend',
          '// @cronbegin',
          '// @cron 0 21 * * *',
          '// @cronend',
        ].join('\n'),
      ),
    ).toEqual([
      { exp: '0 9 * * *', group: 1 },
      { exp: '0 21 * * *', group: 2 },
    ]);
  });

  it('keeps block-outside lines as group 0 even between two blocks', () => {
    expect(
      expsOf(
        [
          '// @cronbegin',
          '// @cron 0 9 * * *',
          '// @cronend',
          '// @cron 0 12 * * *',
          '// @cronbegin',
          '// @cron 0 21 * * *',
          '// @cronend',
        ].join('\n'),
      ),
    ).toEqual([
      { exp: '0 9 * * *', group: 1 },
      { exp: '0 12 * * *', group: 0 },
      { exp: '0 21 * * *', group: 2 },
    ]);
  });
});

describe('getJobItem — 语法错误', () => {
  const errs = (content: string) => {
    const { item: job, logs } = item(content);
    return { job, errs: logsOf(logs, Tag.Error) };
  };

  it('rejects a nested @cronbegin', () => {
    const { job, errs: e } = errs(
      ['// @cronbegin', '// @cronbegin', '// @cron 0 9 * * *', '// @cronend', '// @cronend'].join('\n'),
    );
    expect(job).toBeNull();
    expect(e).toHaveLength(1);
    expect(e[0].args[0]).toContain('Nested @cronbegin');
  });

  it('rejects an unmatched @cronend', () => {
    const { job, errs: e } = errs(['// @cronend', '// @cron 0 9 * * *'].join('\n'));
    expect(job).toBeNull();
    expect(e[0].args[0]).toContain("@cronend didn't match @cronbegin");
  });

  it('rejects an unclosed block', () => {
    const { job, errs: e } = errs(['// @cronbegin', '// @cron 0 9 * * *'].join('\n'));
    expect(job).toBeNull();
    expect(e[0].args[0]).toContain('Unclosed @cronbegin/@cronend block');
  });

  it('warns about lines inside a block without @cron', () => {
    const { item: job, logs } = item(
      ['// @cronbegin', '// this line is inside the block but has no marker', '// @cron 0 9 * * *', '// @cronend'].join('\n'),
    );
    expect(job!.flatCronGroups).toHaveLength(1);
    expect(logsOf(logs, Tag.Warn)).toHaveLength(1);
    expect(logsOf(logs, Tag.Warn)[0].args[0]).toContain('@cron should be used to mark cron expressions');
    // F38：日志用相对路径，避免每个 tick 都刷绝对路径
    expect(String(logsOf(logs, Tag.Warn)[0].args[0])).not.toContain('/virtual/dir/');
  });

});

describe('getJobItem — 解释器', () => {
  it('uses the default interpreter per extension', () => {
    const { item: js } = item('// @cron * * * * *', '/virtual/dir/x.js');
    expect(js!.interpreter.cmd).toBe(process.execPath);

    const { item: sh } = item('# @cron * * * * *', '/virtual/dir/x.sh');
    expect(['bash', 'sh']).toContain(sh!.interpreter.cmd);
  });

  it('lets a shebang override the default interpreter', () => {
    const { item: job } = item('#!/usr/bin/env node --enable-source-maps\n// @cron * * * * *', '/virtual/dir/x.js');
    expect(job!.interpreter).toEqual({ cmd: '/usr/bin/env', args: ['node', '--enable-source-maps'] });
  });
});
