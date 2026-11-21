import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 端到端用例会 spawn 真实子进程，串行跑更容易定位问题
    pool: 'forks',
    reporters: ['default'],
  },
});
