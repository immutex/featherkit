import { mkdirSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { OrchestratorEvent } from './events.js';

export type EventLogger = {
  emit: (event: OrchestratorEvent) => void;
  close: () => Promise<void>;
};

export function createEventLogger(stateDir: string, cwd = process.cwd()): EventLogger {
  const directory = join(cwd, stateDir);
  const eventLogPath = join(directory, 'events.jsonl');
  mkdirSync(directory, { recursive: true });

  let closed = false;
  let pendingWrite = Promise.resolve();
  let writeError: unknown = null;

  return {
    emit: (event) => {
      if (closed) {
        return;
      }

      const line = `${JSON.stringify(event)}\n`;
      pendingWrite = pendingWrite
        .catch(() => undefined)
        .then(async () => {
          await appendFile(eventLogPath, line, 'utf8');
          writeError = null;
        })
        .catch((error) => {
          writeError = error;
          console.error(`[feather] event-log:write-failed reason=${error instanceof Error ? error.message : String(error)}`);
        });
    },
    close: async () => {
      closed = true;
      await pendingWrite;

      if (writeError) {
        throw writeError;
      }
    },
  };
}
