import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadState, saveState } from '../../src/mcp/state-io.js';
import { runOrchestrator } from '../../src/orchestrator/loop.js';
import { cleanup, createTmpProject } from './helpers.js';

describe('e2e orchestrate', () => {
  it(
    'dry-run emits phase:start, writes events.jsonl, and sets currentTask',
    async () => {
      const { tmpDir, config } = await createTmpProject('e2e-orchestrate');
      const seenEvents: Array<{ type: string; phase?: string }> = [];

      try {
        const state = await loadState(config.stateDir, tmpDir);
        state.tasks.push({ id: 'test-task', title: 'E2E task', status: 'pending', progress: [] });
        await saveState(state, config.stateDir, tmpDir);

        await runOrchestrator(
          config,
          { onEvent: (event) => seenEvents.push({ type: event.type, phase: 'phase' in event ? event.phase : undefined }) },
          { dryRun: true, taskId: 'test-task', cwd: tmpDir },
        );

        expect(seenEvents.some((event) => event.type === 'phase:start')).toBe(true);

        const updatedState = await loadState(config.stateDir, tmpDir);
        expect(updatedState.currentTask).toBe('test-task');

        const eventLogPath = join(tmpDir, config.stateDir, 'events.jsonl');
        const lines = (await readFile(eventLogPath, 'utf8')).trim().split('\n').filter(Boolean);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.map((line) => JSON.parse(line)).some((event) => event.type === 'phase:start')).toBe(true);
      } finally {
        await cleanup(tmpDir);
      }
    },
    30_000,
  );
});
