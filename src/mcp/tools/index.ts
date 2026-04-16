// No console.log — stdout is the JSON-RPC transport.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetProjectBrief } from './get-project-brief.js';
import { registerGetActiveFocus } from './get-active-focus.js';
import { registerGetTask } from './get-task.js';
import { registerStartTask } from './start-task.js';
import { registerAppendProgress } from './append-progress.js';
import { registerRecordReviewNotes } from './record-review-notes.js';
import { registerWriteHandoff } from './write-handoff.js';
import { registerRecordDecision } from './record-decision.js';
import { registerListTasks } from './list-tasks.js';
import { registerGetDiff } from './get-diff.js';
import { registerPrepareContextPack } from './prepare-context-pack.js';

export function registerAllTools(server: McpServer): void {
  registerGetProjectBrief(server);
  registerGetActiveFocus(server);
  registerGetTask(server);
  registerStartTask(server);
  registerAppendProgress(server);
  registerRecordReviewNotes(server);
  registerWriteHandoff(server);
  registerRecordDecision(server);
  registerListTasks(server);
  registerGetDiff(server);
  registerPrepareContextPack(server);
}
