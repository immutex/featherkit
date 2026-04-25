import { createRequire } from 'node:module';
import { defineConfig } from 'tsup';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node22',
    outDir: 'dist',
    clean: true,
    define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: { server: 'src/mcp/server.ts' },
    format: ['esm'],
    target: 'node22',
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
