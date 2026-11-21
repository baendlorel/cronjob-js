import { describe, expect, it } from 'vitest';

import { getShebang } from '../src/syntax/shebang.js';

describe('getShebang', () => {
  it('returns null for a non-shebang line', () => {
    expect(getShebang('// @cron * * * * *')).toBeNull();
    expect(getShebang('# comment, not shebang')).toBeNull();
    expect(getShebang('')).toBeNull();
  });

  it('returns null for a bare "#!" with no command', () => {
    expect(getShebang('#!')).toBeNull();
    expect(getShebang('#!   ')).toBeNull();
  });

  it('splits command and args', () => {
    expect(getShebang('#!/usr/bin/env node')).toEqual({ cmd: '/usr/bin/env', args: ['node'] });
    expect(getShebang('#!/bin/bash -e')).toEqual({ cmd: '/bin/bash', args: ['-e'] });
    expect(getShebang('#!python3 -u')).toEqual({ cmd: 'python3', args: ['-u'] });
  });

  it('collapses arbitrary whitespace between tokens', () => {
    expect(getShebang('#!  /usr/bin/env\t  -S   node  ')).toEqual({
      cmd: '/usr/bin/env',
      args: ['-S', 'node'],
    });
  });

  it('treats a command with no args as args: []', () => {
    expect(getShebang('#!/bin/sh')).toEqual({ cmd: '/bin/sh', args: [] });
  });
});
