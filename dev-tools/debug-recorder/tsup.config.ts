import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      cli: 'src/cli.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    outDir: 'dist',
    target: 'node18',
    splitting: false,
    external: ['react', 'ink'],
  },
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    minify: false,
    shims: true,
    outDir: 'dist',
    target: 'node18',
    splitting: false,
  },
]);
