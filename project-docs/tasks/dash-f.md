# Task: dash-f

## Goal
Expand the verification system from `tsc + test` to seven distinct checks (lint, format, build, git-clean, deps-drift) and integrate them as gating nodes in the workflow DAG. The Verification tab in the dashboard shows real check results with a Re-run button.

## Files
- **`src/verification/checks/typecheck.ts`** *(extract from existing verify_phase tool)* — `runTypecheck(cwd): CheckResult`.
- **`src/verification/checks/test.ts`** *(extract)* — `runTests(cwd): CheckResult`.
- **`src/verification/checks/lint.ts`** *(new)* — detect `eslint`/`biome` in project, run whichever is present. If neither found, return `{ status: 'skipped' }`.
- **`src/verification/checks/format.ts`** *(new)* — detect `prettier`/`biome format`, run check (not write). Skip if none found.
- **`src/verification/checks/build.ts`** *(new)* — run `npm run build` / `bun run build` if `scripts.build` in nearest `package.json`. Skip if not present.
- **`src/verification/checks/git-clean.ts`** *(new)* — `git status --porcelain` scoped to `task.files` if available, else full repo. Fail if uncommitted changes exist outside expected paths.
- **`src/verification/checks/deps-drift.ts`** *(new)* — compare `package.json` dependencies against lockfile. Fail if they differ (using `bun install --frozen-lockfile --dry-run` or equivalent).
- **`src/verification/subprocess.ts`** *(new)* — isolated child-process runner for verification checks so they are deterministic under Bun/Vitest without execa mock leakage.
- **`src/verification/runner.ts`** *(new)* — `runChecks(names: string[], cwd): CheckSummary`. Runs named checks in parallel, collects results.
- **`src/verification/index.ts`** *(new)* — exports all check functions + `AVAILABLE_CHECKS` map.
- **`src/orchestrator/loop.ts`** — run `node.requires` verification checks in the caller path before agent spawn; block the task and persist results if any required check fails.
- **`src/utils/verify.ts`** — expand the build phase verifier to use `runChecks()` instead of inline tsc/test calls.
- **`src/server/routes/verification.ts`** *(new)* — `GET /api/verification/:taskId` → last check results from state. `POST /api/verification/:taskId/run` → run all enabled checks, return results + persist to state.
- **`src/server/index.ts`** — wire the verification route into `feather serve`.
- **`src/config/schema.ts`** — persist the latest task-level verification summary in state.
- **`featherkit-dashboard/src/lib/queries.ts`** — add verification query + rerun mutation hooks and types.
- **`featherkit-dashboard/src/views/Projects.tsx` (VerificationTable)** — wire to `useQuery(['verification', taskId])` + Re-run button calls `apiPost('/api/verification/:id/run')`.
- **`test/verification/checks.test.ts`** *(new)* — unit tests for each check using temp dirs with known pass/fail conditions.
- **`test/orchestrator/loop.test.ts`** — verify `requires` gating blocks the build phase when typecheck fails.
- **`test/server/routes.test.ts`** — verify verification API reruns and state persistence through `feather serve`.

## Done Criteria
- [x] `runChecks(['typecheck', 'test'], cwd)` on this repo returns `{ typecheck: 'pass', test: 'pass' }`.
- [x] `runChecks(['lint'], cwd)` returns `skipped` if biome/eslint not found, `pass`/`fail` if found.
- [x] A workflow node with `requires: ['typecheck', 'test']` blocks the agent spawn if typecheck fails — confirmed by introducing a deliberate TS error and running the orchestrator.
- [x] `POST /api/verification/:id/run` returns check results and persists them to state.json.
- [x] Verification tab in the dashboard shows real check results with last-run timestamp and Re-run button.
- [x] Re-run button issues the POST and updates the table within 10s.
- [x] `bun run build` passes. `bun test test/verification/checks.test.ts` passes.

## Risks
- `git-clean` scoped to task files requires `task.files` to be populated — this field may not exist on all tasks. Fall back to full repo diff if `task.files` is empty.
- `deps-drift` check must not run `bun install` — read-only. Use `bun install --frozen-lockfile --dry-run` and check exit code. If bun doesn't support this flag, use direct lockfile parse comparison.
- Running checks in parallel may cause output interleaving in logs. Each check must write to its own isolated result struct, never to stdout directly.
- The `engine.ts` change (check `requires` before returning a role) is the trickiest part — it makes `nextStep()` potentially async. If the engine stays sync, checks must be sync too (no async child processes inside `nextStep`). Alternative: move the check invocation to the caller in `loop.ts` and pass the result back in. Clarify architecture before building.

## Constraints
- Each check is a pure subprocess call — no AI, no network.
- `CheckResult = { status: 'pass' | 'fail' | 'skipped'; output?: string; durationMs: number }`.
- Checks must not mutate files (`--check` mode only for formatters).
- `requires` in the workflow JSON is optional. Nodes without it behave exactly as before.

## Depends on
- `dash-a` (workflow node schema with `requires` field)
- `dash-b` (verification API routes)
- `dash-c` (dashboard query hooks)
