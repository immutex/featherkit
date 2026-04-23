# Current Focus

**Project:** featheragents
**Updated:** 2026-04-23

## Active Tasks

| ID | Title | Task file |
|----|-------|-----------|
| `ipc-a` | Cross-process event relay — orchestrator → dashboard WS | `tasks/ipc-a.md` |
| `auth-a` | OAuth + Claude CLI auth — `feather auth` + Connections tab | `tasks/auth-a.md` |

## Next Up

None — these three complete the 1.0.0-alpha MVP.

## Blocked

None

## Done (MVP sprint)

| ID | Title |
|----|-------|
| `pi-a` | Adopt pi-mono extension ecosystem |
| `mem-a` | Memory system foundation — SQLite schema + MemoryStore |
| `mem-b` | Hybrid retrieval pipeline with reranking and assembly |
| `mem-c` | Memory write path — extraction, worthiness, dedup, commit |
| `mem-d` | Wire memory into orchestrator loop + MCP tools + API routes |
| `mem-e` | Dashboard Memory tab — graph, timeline, inspector |
| `dash-a` | Workflow engine — configurable DAG |
| `dash-b` | HTTP+WS server — `feather serve` backend |
| `dash-c` | Wire dashboard frontend to real backend |
| `dash-d` | Workflow canvas editor — real backend wiring |
| `orch-a` | Orchestrator schema & foundation |
| `orch-b` | Claude Code runner — subprocess + session management |
| `orch-c` | State loop & lock |
| `orch-d` | Approval gates |
| `orch-e` | TUI dashboard |
| `orch-f2` | Meta-router — `claude --print` harness |
| `mvp-polish` | Fix failing tests, fill architecture.md, bump to 1.0.0-alpha |
| `ci-a` | GitHub Actions CI + npm publish pipeline + feather bin alias |

## Post-Alpha

- `dash-e` — Full Pi OAuth MCP CRUD + Skills tab in Connections
- `dash-f` — Extended verification checks (lint, format, deps-drift)
