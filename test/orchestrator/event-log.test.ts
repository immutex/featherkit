import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { createEventLogger } from '../../src/orchestrator/event-log.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-event-log-${randomUUID()}`);
}

describe('createEventLogger', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('writes orchestrator events as json lines', async () => {
    const cwd = makeTmpDir();
    directories.push(cwd);

    const logger = createEventLogger('.project-state', cwd);
    logger.emit({ type: 'phase:start', taskId: 'ipc-a', phase: 'build' });
    logger.emit({ type: 'phase:complete', taskId: 'ipc-a', phase: 'build', status: 'ok', durationMs: 12 });
    logger.emit({ type: 'task:done', taskId: 'ipc-a' });
    await logger.close();

    const raw = await readFile(join(cwd, '.project-state', 'events.jsonl'), 'utf8');
    const parsed = raw.trim().split('\n').map((line) => JSON.parse(line));

    expect(parsed).toEqual([
      { type: 'phase:start', taskId: 'ipc-a', phase: 'build' },
      { type: 'phase:complete', taskId: 'ipc-a', phase: 'build', status: 'ok', durationMs: 12 },
      { type: 'task:done', taskId: 'ipc-a' },
    ]);
  });
});
