import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    // tsup sets baseUrl for declaration builds, which TypeScript 6 flags as deprecated
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    clean: true,
    sourcemap: true,
    target: 'es2020',
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
