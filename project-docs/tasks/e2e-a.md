# Task: e2e-a

## Goal
Write integration tests that exercise featherkit end-to-end against a real temp directory — proving that `feather init`, `feather doctor`, `feather serve`, and `feather orchestrate --dry-run` all work as a user would experience them, not just as isolated units.

## Context
The existing test suite is all unit tests. They mock state, mock the file system, or test pure functions. Nothing proves that the CLI binary, the MCP server, the HTTP server, and the orchestrator actually compose correctly when run in a real directory. Before publishing 1.0.0-alpha, we need at least one test that touches the full stack.

## Files

- **`test/e2e/init.test.ts`** *(new)* — runs `feather init` non-interactively (using `--preset` flag or programmatic call to `runInit`) against a temp dir; asserts all expected files exist (`featherkit/config.json`, `project-docs/`, `.project-state/state.json`, etc.).
- **`test/e2e/doctor.test.ts`** *(new)* — runs `runDoctor(tmpDir)` after a clean init; asserts it returns `true` (all checks pass). Also runs on a broken dir (no MCP entry in `.mcp.json`) and asserts it returns `false`.
- **`test/e2e/serve.test.ts`** *(new)* — starts `feather serve` on a random port in a child process (or calls `startServer(config, port)` directly), waits for the HTTP server to be ready (poll `/api/state`), asserts:
  - `GET /api/state` without token → 401
  - `GET /api/state` with token → 200 + valid JSON matching `ProjectStateSchema`
  - `GET /api/workflow` → 200 + valid `WorkflowSchema` JSON
  - WebSocket `/events?token=<token>` connects successfully + receives a heartbeat ping within 5s
  - Cleans up (kills server process) in `afterAll`.
- **`test/e2e/orchestrate.test.ts`** *(new)* — calls `runOrchestrator(config, hooks, { dryRun: true, taskId: 'test-task' })` against a temp project with one pending task; asserts:
  - `onEvent` receives at least one `phase:start` event
  - `.project-state/events.jsonl` exists and contains valid JSON lines after the run
  - state.json `currentTask` is set during the run
  - No errors thrown (dry-run should always succeed)
- **`test/e2e/helpers.ts`** *(new)* — shared setup: `createTmpProject()` (mkdtemp + run init), `readToken(stateDir)`, `waitForHttp(url, ms)`, `cleanup(tmpDir)`.
- **`vitest.config.ts`** *(check/update)* — ensure e2e tests run with a longer timeout (30s per test) and are included in the default test run (or add an `e2e` script that runs only `test/e2e/**`).

## Done Criteria
- [x] `bun test test/e2e/` runs all four test files with 0 failures.
- [x] `init.test.ts` — asserts all 16+ files that `feather init` creates actually exist on disk.
- [x] `doctor.test.ts` — clean init → `runDoctor` returns `true`; corrupted setup → returns `false`.
- [x] `serve.test.ts` — 401 on unauth, 200 on auth, WS connects and receives heartbeat. Server killed cleanly in `afterAll`.
- [x] `orchestrate.test.ts` — dry-run emits `phase:start` event, writes `events.jsonl`, exits cleanly.
- [x] No temp directories leaked after test run (check with `ls /tmp/featherkit-*` before and after).
- [x] `bun test` (full suite) continues to pass — e2e tests don't break unit tests.

## Risks
- `serve.test.ts` starts a real HTTP server. Port must be randomized to avoid conflicts when running tests in parallel. Use `port: 0` (OS-assigned) if the server supports it, or pick a random high port.
- `orchestrate.test.ts` in dry-run mode will not spawn `claude` or Pi, but it will try to load config and state. The temp project must have a valid `featherkit/config.json` — generate it with `runInit` first.
- The e2e tests are inherently slower than unit tests. Set `testTimeout: 30000` in vitest config for the e2e suite. Consider a separate `bun run test:e2e` script so CI can run them separately with a longer timeout.
- `createTmpProject()` runs `runInit` programmatically. If `runInit` has interactive prompts, it will hang. Confirm there's a non-interactive path (there is: pass `options` directly to `runInit`).

## Constraints
- E2E tests must clean up their temp directories — use `afterAll(() => rm(tmpDir, { recursive: true }))`.
- No mocking of `fs`, `execa`, or child processes in e2e tests. That defeats the purpose. The only acceptable mock is providing a fake `claude` binary on PATH that exits 0 for the orchestrator dry-run path (dry-run doesn't spawn claude anyway, so this may not be needed).
- The tests must pass on a machine that has no `claude` binary installed — use `runDoctor` directly (not the CLI binary) to avoid needing the binary in PATH for the doctor test.
- Keep each test file under 150 lines. Move shared setup to `helpers.ts`.

## Depends on
- `dash-b` ✓ (server exists)
- `ipc-a` (events.jsonl) — orchestrate test checks for it; if ipc-a isn't done yet, skip that assertion and add a `// TODO: ipc-a` comment
