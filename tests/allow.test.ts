import { describe, expect, it } from 'vitest';

import { getAllowFn } from '../src/syntax/allow.js';

describe('getAllowFn', () => {
  describe('.ts / .js', () => {
    const allow = getAllowFn('.js');

    it.each([
      '// single line',
      '/* block start',
      '* block middle',
      '*/ block end',
      '*/',
      '',
    ])('allows %j', (line) => {
      expect(allow(line)).toBe(true);
    });

    it.each(['const x = 1;', 'import fs from "node:fs";', '  // indented (already trimmed upstream)'])(
      'rejects %j',
      (line) => {
        expect(allow(line)).toBe(false);
      },
    );

    it('shares the same rules for .ts', () => {
      expect(getAllowFn('.ts')('// ok')).toBe(true);
      expect(getAllowFn('.ts')('let x: number')).toBe(false);
    });
  });

  describe('.sh', () => {
    const allow = getAllowFn('.sh');

    it('allows # comments and blank lines only', () => {
      expect(allow('# @cron * * * * *')).toBe(true);
      expect(allow('')).toBe(true);
      expect(allow('echo hi')).toBe(false);
      // shebang 也会命中 '#'，但 job.ts 会先摘掉首行 shebang
      expect(allow('#!/bin/bash')).toBe(true);
    });
  });

  describe('.py', () => {
    const allow = getAllowFn('.py');

    it('allows # and docstring delimiters', () => {
      expect(allow('# @cron * * * * *')).toBe(true);
      expect(allow("'''")).toBe(true);
      expect(allow('"""')).toBe(true);
      expect(allow('')).toBe(true);
      expect(allow('print("hi")')).toBe(false);
      expect(allow('def main():')).toBe(false);
    });
  });

  it('rejects everything for unknown extensions', () => {
    expect(getAllowFn('.rb')('# @cron * * * * *')).toBe(false);
    expect(getAllowFn('')('')).toBe(false);
  });
});
