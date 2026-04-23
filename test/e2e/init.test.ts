import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getAllTemplates } from '../../src/templates/index.js';
import { cleanup, createTmpProject, projectExists } from './helpers.js';

describe('e2e init', () => {
  it(
    'creates all generated project files on disk',
    async () => {
      const { tmpDir, config } = await createTmpProject('e2e-init');
      try {
        const expected = [
          ...getAllTemplates(config).map((file) => file.relativePath),
          '.mcp.json',
          '.claude/settings.local.json',
        ];

        expect(expected.length).toBeGreaterThanOrEqual(16);
        for (const relativePath of expected) {
          expect(existsSync(join(tmpDir, relativePath)), relativePath).toBe(true);
        }
      } finally {
        await cleanup(tmpDir);
        expect(projectExists(tmpDir)).toBe(false);
      }
    },
    30_000,
  );
});
