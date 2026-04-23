import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runDoctor } from '../../src/commands/doctor.js';
import { cleanup, createTmpProject } from './helpers.js';

describe('e2e doctor', () => {
  it(
    'passes on a clean init and fails after MCP config corruption',
    async () => {
      const { tmpDir, binDir } = await createTmpProject('e2e-doctor-ok', { installPackage: true, fakeBinaries: ['claude', 'pi'] });
      const previousPath = process.env.PATH;
      process.env.PATH = `${binDir}:${previousPath ?? ''}`;

      try {
        await expect(runDoctor(tmpDir)).resolves.toBe(true);

        const mcpPath = join(tmpDir, '.mcp.json');
        const parsed = JSON.parse(await readFile(mcpPath, 'utf8')) as { mcpServers?: Record<string, unknown> };
        await writeFile(mcpPath, JSON.stringify({ ...parsed, mcpServers: {} }, null, 2) + '\n', 'utf8');

        await expect(runDoctor(tmpDir)).resolves.toBe(false);
      } finally {
        process.env.PATH = previousPath;
        await cleanup(tmpDir);
      }
    },
    30_000,
  );
});
