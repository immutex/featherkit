import { statSync, watch } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { OrchestratorEvent } from '../orchestrator/events.js';

async function readChunk(filePath: string, start: number, end: number): Promise<string> {
  if (end <= start) {
    return '';
  }

  const handle = await open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(end - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

export function tailEventLog(
  stateDir: string,
  cwd: string,
  onEvent: (event: OrchestratorEvent) => void,
): () => void {
  const directory = join(cwd, stateDir);
  const filePath = join(directory, 'events.jsonl');
  const fileName = basename(filePath);

  let offset = 0;
  let remainder = '';
  let stopped = false;
  let draining = Promise.resolve();

  try {
    offset = statSync(filePath).size;
  } catch {
    offset = 0;
  }

  async function drain(): Promise<void> {
    if (stopped) {
      return;
    }

    let nextSize = offset;
    try {
      nextSize = (await stat(filePath)).size;
    } catch {
      return;
    }

    if (nextSize < offset) {
      offset = nextSize;
      remainder = '';
      return;
    }

    const chunk = await readChunk(filePath, offset, nextSize);
    offset = nextSize;
    if (chunk.length === 0) {
      return;
    }

    const lines = `${remainder}${chunk}`.split('\n');
    remainder = lines.pop() ?? '';

    for (const line of lines) {
      if (stopped || line.trim().length === 0) {
        continue;
      }

      try {
        onEvent(JSON.parse(line) as OrchestratorEvent);
      } catch (error) {
        console.error(`[feather] event-tail:parse-failed reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const watcher = watch(directory, { encoding: 'utf8' }, (_eventType, changedFile) => {
    if (stopped || changedFile !== fileName) {
      return;
    }

    draining = draining
      .catch(() => undefined)
      .then(() => drain())
      .catch((error) => {
        console.error(`[feather] event-tail:read-failed reason=${error instanceof Error ? error.message : String(error)}`);
      });
  });

  return () => {
    stopped = true;
    watcher.close();
  };
}
