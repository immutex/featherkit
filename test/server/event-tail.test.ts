import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { defaultConfig } from '../../src/config/defaults.js';
import { createEventLogger } from '../../src/orchestrator/event-log.js';
import { startServer } from '../../src/server/index.js';
import { tailEventLog } from '../../src/server/event-tail.js';

function makeTmpDir(): string {
  return join(tmpdir(), `fa-event-tail-${randomUUID()}`);
}

async function waitFor(expectation: () => void, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      expectation();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  expectation();
}

describe('tailEventLog', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('broadcasts new log events to websocket clients without replaying history', async () => {
    const cwd = makeTmpDir();
    directories.push(cwd);

    const config = defaultConfig('ipc-a-test');
    await mkdir(join(cwd, config.stateDir), { recursive: true });

    const preLogger = createEventLogger(config.stateDir, cwd);
    preLogger.emit({ type: 'phase:start', taskId: 'old', phase: 'frame' });
    await preLogger.close();

    const server = await startServer(config, 0, { cwd });

    try {
      const messages: unknown[] = [];
      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/events?token=${server.token}`);
      socket.on('message', (data) => {
        messages.push(JSON.parse(String(data)));
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for websocket connection')), 2_000);
        socket.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      const logger = createEventLogger(config.stateDir, cwd);
      logger.emit({ type: 'phase:start', taskId: 'ipc-a', phase: 'build' });
      logger.emit({ type: 'task:done', taskId: 'ipc-a' });
      await logger.close();

      await waitFor(() => {
        expect(messages).toEqual(
          expect.arrayContaining([
            { type: 'phase:start', taskId: 'ipc-a', phase: 'build' },
            { type: 'task:done', taskId: 'ipc-a' },
          ]),
        );
      });

      await new Promise<void>((resolve) => {
        socket.once('close', () => resolve());
        socket.close();
      });
    } finally {
      await server.close();
    }
  }, 10_000);

  it('tails only new events appended after startup', async () => {
    const cwd = makeTmpDir();
    directories.push(cwd);

    const stateDir = join(cwd, '.project-state');
    const logPath = join(stateDir, 'events.jsonl');
    await mkdir(stateDir, { recursive: true });
    await writeFile(logPath, `${JSON.stringify({ type: 'phase:start', taskId: 'old', phase: 'frame' })}\n`, 'utf8');

    const events: unknown[] = [];
    const stop = tailEventLog('.project-state', cwd, (event) => {
      events.push(event);
    });

    await appendFile(
      logPath,
      [
        JSON.stringify({ type: 'phase:start', taskId: 'ipc-a', phase: 'build' }),
        JSON.stringify({ type: 'task:done', taskId: 'ipc-a' }),
      ].join('\n') + '\n',
      'utf8',
    );

    await waitFor(() => {
      expect(events).toEqual([
        { type: 'phase:start', taskId: 'ipc-a', phase: 'build' },
        { type: 'task:done', taskId: 'ipc-a' },
      ]);
    });

    stop();
  });

  it('stops delivering events after the stop function is called', async () => {
    const cwd = makeTmpDir();
    directories.push(cwd);

    const stateDir = join(cwd, '.project-state');
    const logPath = join(stateDir, 'events.jsonl');
    await mkdir(stateDir, { recursive: true });
    await writeFile(logPath, '', 'utf8');

    const events: unknown[] = [];
    const stop = tailEventLog('.project-state', cwd, (event) => {
      events.push(event);
    });

    await appendFile(logPath, `${JSON.stringify({ type: 'phase:start', taskId: 'ipc-a', phase: 'build' })}\n`, 'utf8');
    await waitFor(() => {
      expect(events).toHaveLength(1);
    });

    stop();
    await appendFile(logPath, `${JSON.stringify({ type: 'task:done', taskId: 'ipc-a' })}\n`, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(events).toEqual([{ type: 'phase:start', taskId: 'ipc-a', phase: 'build' }]);
  });
});
