// No console.log — stdout is the JSON-RPC transport.
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadState, saveState, loadConfig, resolveDocsDir } from '../state-io.js';
import {
  runVerifyFrame,
  runVerifyBuild,
  runVerifyCritic,
  formatVerificationResult,
} from '../../utils/verify.js';

export function registerVerifyPhase(server: McpServer): void {
  server.registerTool(
    'verify_phase',
    {
      description:
        'Run deterministic phase gate checks before handing off — zero cost, no AI. Checks task file completeness, git scope (scope creep detection), TypeScript, and tests. Call at the end of build sessions before write_handoff.',
      inputSchema: {
        phase: z
          .enum(['frame', 'build', 'critic'])
          .describe('Phase to verify: frame (task file), build (scope+TS+tests), or critic (review notes)'),
        taskId: z
          .string()
          .optional()
          .describe('Task ID — falls back to currentTask if omitted'),
        base: z
          .string()
          .optional()
          .describe('Git ref for scope check (default: "HEAD"). Use "main" or "HEAD~1" to compare across commits.'),
      },
    },
    async ({ phase, taskId, base = 'HEAD' }) => {
      const config = await loadConfig();
      const state = await loadState(config?.stateDir);
      const cwd = process.cwd();
      const docsDir = resolveDocsDir(config);

      const resolvedId = taskId ?? state.currentTask;
      if (!resolvedId) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No task specified and no current task is active. Pass taskId or run start_task first.',
            },
          ],
        };
      }

      const task = state.tasks.find((t) => t.id === resolvedId);
      const opts = { taskId: resolvedId, base, cwd, docsDir };

      let result;
      if (phase === 'frame') {
        result = await runVerifyFrame(opts);
      } else if (phase === 'build') {
        result = await runVerifyBuild(opts);
      } else {
        result = await runVerifyCritic(opts, task?.reviewNotes);
      }

      // Persist to state (append-only)
      if (task) {
        task.verifications = [...(task.verifications ?? []), result];
        await saveState(state, config?.stateDir);
      }

      return {
        content: [{ type: 'text' as const, text: formatVerificationResult(result) }],
      };
    }
  );
}
