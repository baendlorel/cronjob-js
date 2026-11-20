import { defineConfig } from 'tsdown';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig([
  {
    entry: [{ index: 'src/index.ts' }],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: !isDev,
    target: 'node24',
    treeshake: !isDev,
    deps: {
      onlyBundle: ['type-narrow'],
    },
  },
]);
