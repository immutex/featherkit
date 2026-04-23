# Task: ipc-a

## Goal
Implement cross-process event relay so that `feather orchestrate` (separate OS process) can deliver live `OrchestratorEvent` data to the `feather serve` WS server. Without this, the dashboard event stream is dead whenever the two commands run in separate terminals.

## Context
`feather serve` and `feather orchestrate` are separate CLI commands that run as independent OS processes. They share `state.json` via atomic file writes, but they do NOT share an in-process event emitter. The current `dash-b` plan assumes a shared emitter — this task fixes that assumption with a file-based event relay.

**Design: append-only event log + tail**
- Orchestrator appends `OrchestratorEvent` JSON lines to `.project-state/events.jsonl` on every event emission.
- Dashboard server watches the file with `fs.watch` (no extra deps), reads new bytes on change, parses each new line, and broadcasts to WS clients.
- On `feather serve` startup: note the current file offset → only tail new events, don't replay history.
- On `feather orchestrate` startup: open the file in append mode (create if missing).

## Files
- **`src/orchestrator/event-log.ts`** *(new)* — `createEventLogger(stateDir, cwd): EventLogger`. Returns `{ emit(event), close() }`. Uses `fs.appendFile` (atomic enough for single-writer). Writes `JSON.stringify(event) + '\n'`.
- **`src/orchestrator/loop.ts`** — wire `EventLogger` as an additional `onEvent` sink alongside the existing hook. The loop creates/closes the logger around its run.
- **`src/server/event-tail.ts`** *(new)* — `tailEventLog(stateDir, cwd, onEvent): () => void`. Opens the log file, records current byte offset, calls `fs.watch` on it. On file change: reads from last offset to end, parses JSON lines, calls `onEvent` for each. Returns a stop function.
- **`src/server/ws.ts`** *(used in dash-b)* — instead of subscribing to an in-process emitter, call `tailEventLog(...)` and broadcast each received event to WS clients.
- **`test/orchestrator/event-log.test.ts`** *(new)* — write 3 events, read the file, verify 3 JSON lines.
- **`test/server/event-tail.test.ts`** *(new)* — write lines to a temp file after tail starts, verify `onEvent` fires for each new line.

## Done Criteria
- [x] Running `feather orchestrate --dry-run` in terminal A and `feather serve` in terminal B: WS client receives `phase:start`, `phase:complete`, `task:done` events within 1s of the orchestrator emitting them.
- [x] `.project-state/events.jsonl` exists and contains valid JSON lines after an orchestrator run.
- [x] `feather serve` started after an orchestrator run does NOT replay old events (tail starts at current EOF).
- [x] `tailEventLog` stop function prevents further file-watch callbacks after calling.
- [x] `bun run build` passes. `bun test test/orchestrator/event-log.test.ts test/server/event-tail.test.ts` passes.

## Risks
- `fs.watch` on Linux uses `inotify`. On some systems it fires once per `appendFile` call regardless of byte count — verify the tail reader correctly handles multi-line appends in a single watch event.
- If both `feather orchestrate` and `feather serve` write to the same file (they shouldn't — only orchestrator writes, server reads), there could be corruption. Document the single-writer contract clearly.
- The log file will grow unboundedly. For MVP: no rotation. Add a `feather purge` command as a follow-up to truncate old logs.

## Constraints
- No new runtime deps. Use `node:fs` and `node:fs/promises` only.
- Single writer contract: only `EventLogger` appends to `events.jsonl`. Server is read-only.
- JSON parse failures on individual lines must not crash the tail — log to `console.error` and skip.
- `EventLogger.close()` must flush any pending write before resolving.

## Depends on
- `orch-a` (OrchestratorEvent types) ✓ done
- `dash-b` (server ws.ts) — built in parallel; `ipc-a` provides the tail primitive `dash-b` uses
