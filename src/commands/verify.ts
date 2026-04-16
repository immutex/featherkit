import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { loadState, saveState, resolveDocsDir } from '../mcp/state-io.js';
import { log } from '../utils/logger.js';
import {
  runVerifyFrame,
  runVerifyBuild,
  runVerifyCritic,
} from '../utils/verify.js';
import type { VerificationResult, VerificationCheck } from '../config/schema.js';

// ── Core runner ───────────────────────────────────────────────────────────────

export async function runVerify(
  phase: 'frame' | 'build' | 'critic',
  taskIdArg: string | undefined,
  options: { base?: string; json?: boolean; fix?: boolean },
  cwd: string
): Promise<VerificationResult> {
  const config = await loadConfig(cwd);
  const state = await loadState(config.stateDir, cwd);
  const docsDir = resolveDocsDir(config, cwd);

  const taskId = taskIdArg ?? state.currentTask ?? undefined;
  if (!taskId) {
    log.error('No task specified and no active task. Pass a task ID or run `featherkit task start <id>`.');
    process.exit(1);
  }

  const task = state.tasks.find((t) => t.id === taskId);
  const opts = { taskId, base: options.base ?? 'HEAD', cwd, docsDir };

  log.blank();
  log.bold(`Verifying ${phase} phase for ${taskId}...`);
  log.blank();

  let result: VerificationResult;
  if (phase === 'frame') {
    result = await runVerifyFrame(opts);
  } else if (phase === 'build') {
    result = await runVerifyBuild(opts);
  } else {
    result = await runVerifyCritic(opts, task?.reviewNotes);
  }

  // In --fix mode, downgrade TypeScript failures to warnings
  if (options.fix && phase === 'build') {
    result = {
      ...result,
      checks: result.checks.map((c) =>
        c.name === 'TypeScript' && c.status === 'fail'
          ? { ...c, status: 'warn' as const }
          : c
      ),
    };
    const hasFail = result.checks.some((c) => c.status === 'fail');
    const hasWarn = result.checks.some((c) => c.status === 'warn');
    result = {
      ...result,
      verdict: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
    };
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printVerificationResult(result);
  }

  // Persist to state
  if (task) {
    task.verifications = [...(task.verifications ?? []), result];
    await saveState(state, config.stateDir, cwd);
  }

  return result;
}

function printVerificationResult(result: VerificationResult): void {
  const printCheck = (c: VerificationCheck) => {
    const msg = `${c.name} — ${c.message}`;
    if (c.status === 'pass') log.success(msg);
    else if (c.status === 'warn') log.warn(msg);
    else log.error(msg);
  };

  for (const check of result.checks) {
    printCheck(check);
  }

  log.blank();

  const verdictLabel =
    result.verdict === 'pass'
      ? 'PASS'
      : result.verdict === 'warn'
        ? 'PASS WITH WARNINGS'
        : 'FAIL';
  log.bold(`Verdict: ${verdictLabel}`);

  const issues = result.checks.filter((c) => c.status !== 'pass');
  for (const issue of issues) {
    const prefix = issue.status === 'warn' ? '⚠' : '✗';
    log.dim(`  ${prefix} ${issue.message}`);
  }

  log.blank();
}

// ── Commander command ─────────────────────────────────────────────────────────

export const verifyCommand = new Command('verify')
  .description('Run deterministic phase gate checks before role transition')
  .argument('<phase>', 'Phase to verify: frame | build | critic')
  .argument('[id]', 'Task ID (defaults to current task)')
  .option('--base <ref>', 'Git ref for scope check', 'HEAD')
  .option('--json', 'Output result as JSON')
  .option('--fix', 'Advisory mode — TypeScript errors are warnings, not failures')
  .action(
    async (
      phase: string,
      id: string | undefined,
      options: { base?: string; json?: boolean; fix?: boolean }
    ) => {
      if (!['frame', 'build', 'critic'].includes(phase)) {
        log.error(`Unknown phase "${phase}". Use: frame, build, or critic`);
        process.exit(1);
      }
      try {
        const result = await runVerify(
          phase as 'frame' | 'build' | 'critic',
          id,
          options,
          process.cwd()
        );
        // Exit 1 on hard failure (not just warnings), unless --fix
        if (result.verdict === 'fail' && !options.fix) {
          process.exit(1);
        }
      } catch (err) {
        log.error(String(err));
        process.exit(1);
      }
    }
  );
