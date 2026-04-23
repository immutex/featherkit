# Task: init-b

## Goal
Make `feather init` fully non-interactive via flags so it can be used in CI, scripts, and e2e tests without hanging on prompts. Currently even with `--preset` the client-selection and confirm prompts still block.

## Context
`src/commands/init.ts` has `InitOptions` with only `force`, `preset`, and `localOnly`. Three interactive prompts still run regardless:
1. `input({ message: 'Project name:' })` — no flag to skip
2. `select<Clients>({ message: 'Which coding clients...' })` — no flag to skip  
3. `confirm({ message: 'Create these files?' })` — no flag to skip

The `localOnly` flag skips integrations only. The `preset` flag skips model selection only. There is no complete non-interactive path — scripts and CI hang. The e2e tests work around this by calling `scaffoldFiles` directly (bypassing `buildConfig` entirely), which means they never test the actual CLI init path end-to-end.

## Files
- **`src/commands/init.ts`** *(modify)* —
  - Add `name?: string` to `InitOptions` — used as project name, skips the `input()` prompt
  - Add `clients?: Clients` to `InitOptions` — skips the `select<Clients>()` prompt
  - Add `yes?: boolean` to `InitOptions` — skips the `confirm()` prompt (auto-accepts)
  - In `buildConfig`: if `options.name` is set, use it directly; if `options.clients` is set, skip the select; if `options.yes` is set, skip the confirm
  - Expose all three as CLI flags on the `initCommand`: `--name <name>`, `--clients <both|claude-code|opencode>`, `--yes` / `-y`
  - When all of `name`, `preset`, `clients`, and `yes` (or `localOnly`) are set: zero prompts, fully scriptable
- **`test/init.test.ts`** *(modify)* — add tests for non-interactive path: call `runInit(tmpDir, { name: 'test', preset: 'balanced', clients: 'claude-code', yes: true, localOnly: true })` and assert all files created without interactive prompts.
- **`test/e2e/helpers.ts`** *(modify)* — update `createTmpProject` to call the full `runInit` path with non-interactive flags instead of `scaffoldFiles` directly, so e2e tests exercise the real CLI surface.

## Done Criteria
- [x] `feather init --name my-proj --preset balanced --clients claude-code --yes --local-only` completes without any prompts in a fresh directory.
- [x] All expected scaffold files exist after the non-interactive run (same as interactive).
- [x] `feather init --help` shows `--name`, `--clients`, `--yes` flags with descriptions.
- [x] Existing interactive init flow is unchanged — passing no flags still runs all prompts.
- [x] `bun test test/init.test.ts` passes including the new non-interactive test cases.
- [x] `bun run build` passes.

## Risks
- `@inquirer/prompts` throws `ExitPromptError` when stdin is not a TTY and no default/skip is provided. The fix is purely conditional — only call the prompt when the flag is absent, never try to pass a value into a running prompt.
- `test/e2e/helpers.ts` updating createTmpProject to use full `runInit` may require running in a fake-TTY context or with `{ stdin: 'ignore' }`. If the prompts still run in that context, guard with `process.stdin.isTTY` checks inside init, or keep the direct `scaffoldFiles` call and add a separate test.

## Constraints
- Do not change the prompt text, order, or defaults for interactive users — only add flag-based bypass paths.
- `--clients` must validate the value against `['both', 'claude-code', 'opencode']` and error clearly on invalid input.
- `localOnly` existing flag must continue to work as before (skips integrations checkbox).

## Depends on
- No dependencies — self-contained to `src/commands/init.ts`.
