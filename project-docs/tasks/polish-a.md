# Task: polish-a

## Goal
Fix every stale `featherkit` command reference in user-facing CLI output, harden the orchestrator's silent error path so failures are always visible, and guard `event-tail.ts` against a missing `.project-state/` directory. These are pure reliability and consistency fixes — no new features.

## Context
The binary was renamed from `featherkit` to `feather` (ci-a), but seven files still print `featherkit` in error messages and help strings that users see at first-run. Additionally, the orchestrator's top-level catch silently drops unexpected errors — if an unhandled exception occurs in the loop, the process exits quietly with no indication of what went wrong. Finally, `event-tail.ts` calls `fs.watch(directory, ...)` without ensuring the directory exists, so `feather serve` can crash on startup if the user hasn't run `feather orchestrate` yet.

## Files
- **`src/config/loader.ts`** — change "Run \`featherkit init\`" → "Run \`feather init\`" in error message.
- **`src/commands/doctor.ts`** — change all "Run \`featherkit init\`" → "Run \`feather init\`", "Run \`featherkit mcp install\`" → "Run \`feather mcp install\`".
- **`src/commands/init.ts`** — change "Run \`npx featherkit doctor\`" → "Run \`feather doctor\`" in success message.
- **`src/commands/verify.ts`** — change "run \`featherkit task start <id>\`" → "run \`feather task start <id>\`".
- **`src/commands/review.ts`** — change "Run \`featherkit task start <id>\`" → "Run \`feather task start <id>\`".
- **`src/commands/task.ts`** — change "Run \`featherkit task start <id>\`" → "Run \`feather task start <id>\`".
- **`src/mcp/tools/get-active-focus.ts`** — change "Run \`featherkit init\`" → "Run \`feather init\`".
- **`src/mcp/server.ts`** — read version from `package.json` at build time (same pattern as `src/cli.ts`) instead of hardcoded `'0.1.0'`.
- **`src/orchestrator/loop.ts`** — in the top-level catch block, add `console.error('[feather] orchestrator:unexpected-error', error)` and emit a `{ type: 'phase:failed', taskId: task?.id ?? 'unknown', phase: 'unknown', reason: ... }` event before returning, so the TUI and dashboard always see the failure.
- **`src/server/event-tail.ts`** — add `mkdirSync(directory, { recursive: true })` before `watch(directory, ...)` so `feather serve` doesn't crash when `.project-state/` doesn't exist yet (fresh clone, orchestrate never run).

## Done Criteria
- [ ] `feather init` → success message says "Run `feather doctor`" (not `npx featherkit doctor`).
- [ ] `feather doctor` → failure messages say "Run `feather init`" and "Run `feather mcp install`".
- [ ] `feather verify` and `feather review` → error messages say "feather task start" (not featherkit).
- [ ] `feather serve` started in a fresh directory with no `.project-state/` → starts cleanly without crashing.
- [ ] Introducing a deliberate throw inside `runOrchestrator` (in a test) → error is logged to stderr and a `phase:failed` event is emitted rather than silent exit.
- [ ] MCP server reports version matching `package.json` version (`1.0.0-alpha`) in server init log.
- [ ] `bun test` passes. `bun run build` passes.

## Risks
- The orchestrator catch block currently has no reference to `task` in scope because task is declared inside the while-loop. May need to hoist a `let lastTaskId: string | undefined` variable to track the most recently picked task for error reporting.
- `mkdirSync` in event-tail.ts must use `{ recursive: true }` — it must not throw if the directory already exists.
- MCP server version read uses `readFileSync` + relative path resolution at build time — same pattern as `cli.ts`. If tsup tree-shakes it, pin the import. Test with `bun run build` and check the built dist/server.js.

## Constraints
- Do not change any test assertions — only source files.
- Do not add new external dependencies.
- All changes are string substitutions or small logic additions — no refactoring.

## Depends on
- `ci-a` ✓ (`feather` bin alias added)
