<div align="center">

# 🪶 featheragents

**Lean multi-model agentic coding — without the ceremony**

*Coordinate frontier models. Keep token costs low. Ship faster.*

[![npm version](https://img.shields.io/npm/v/featheragents?color=blue&label=npm)](https://www.npmjs.com/package/featheragents)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/node/v/featheragents?color=brightgreen)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/immutex/featheragents?style=social)](https://github.com/immutex/featheragents)

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Phase Gates](#deterministic-phase-gates) · [CLI Reference](#cli-reference) · [MCP Tools](#mcp-tools) · [Architecture](#architecture) · [Philosophy](#philosophy)

</div>

---

## The Problem

Multi-model agentic workflows in practice look like this:

| Without featheragents | With featheragents |
|-----------------------|--------------------|
| Giant spec → planner burns 15k tokens re-reading the whole repo | Compact task file → planner reads only what's relevant |
| Every agent starts from scratch, restating the whole codebase | Shared MCP state — each agent picks up exactly where the last left off |
| Context jumps between tools with no handoff structure | Explicit `write_handoff` tool — nothing gets lost between models |
| Over-engineering: frameworks, planning phases, forced ceremony | Four stages. Skip any of them on small tasks. |
| Critic reviews the entire codebase | Critic sees the diff + task file only |
| Each agent decides its own "done" criteria | Task file defines done criteria before a single line of code is written |
| Build sends broken code to critic — TypeScript errors, test failures caught 10k tokens later | `verify_phase` catches broken builds before handoff — zero cost, zero AI |
| Agent touches files outside task scope — critic wastes tokens on irrelevant diff | Scope creep detected before critic ever sees the diff |

---

## How It Works

FeatherAgents installs a lightweight 4-stage loop into your project. Models follow it using Claude Code skills and OpenCode agents. A local MCP server holds shared state so no information is lost between steps.

```
┌─────────────────────────────────────────────────────────────────┐
│                     featheragents loop                          │
│                                                                 │
│  /frame           /build           /critic          /sync       │
│  ───────          ───────          ────────         ──────      │
│  Short plan       Implement        Review diff      Update       │
│  Task summary     Use only:        Bugs             state.json  │
│  Files            · task file      Mismatches       Handoff     │
│  Done criteria    · relevant code  Missing tests    notes       │
│  Risks            · chosen tools   Edge cases       Tracker     │
│                                                                 │
│          ↓              ↓               ↓              ↓        │
│   task.md written   code shipped   issues filed   task closed  │
└─────────────────────────────────────────────────────────────────┘
```

**Phase gates run between stages.** Before the build agent hands off, it calls `verify_phase` — a deterministic check that catches TypeScript errors, test failures, and scope creep before they waste tokens on a critic session. See [Deterministic Phase Gates](#deterministic-phase-gates).

**Skip stages freely.** A one-line bugfix doesn't need a frame phase. A high-stakes migration might add a second critic pass. The loop is a guideline, not a gate.

**Mix models.** Run Claude Code for planning and critique, GPT-4o or Codex for implementation. Each model gets only the context relevant to its role.

---

## Deterministic Phase Gates

The headline feature. Every other agentic workflow tool sends work directly from one AI to the next — if the build agent changed the wrong files or TypeScript is broken, the critic finds out the hard way after spending 10k tokens.

**featheragents intercepts.** Before a build agent writes its handoff, it calls `verify_phase` — a zero-cost, zero-AI mechanical check:

```
featheragents verify build FEAT-001

Verifying build phase for FEAT-001...

✓ Task file — project-docs/tasks/FEAT-001.md
✓ Goal section — non-empty
✓ Files section — 2 file(s) listed
✓ Done Criteria — 3 items
✓ Scope: src/mcp/tools/get-diff.ts — in task file
✓ Scope: src/mcp/tools/index.ts — in task file
⚠ Scope: test/mcp-tools.test.ts — not in task file (scope creep or update ## Files list)
✓ TypeScript — tsc --noEmit — 0 errors
✓ Tests — vitest run — 210 passed

Verdict: PASS WITH WARNINGS
  ⚠ test/mcp-tools.test.ts changed outside task scope
```

Three gates, one command:

| Gate | When | Checks |
|------|------|--------|
| `featheragents verify frame <id>` | After framing, before build | Task file exists, Goal/Files/Done Criteria/Risks non-empty |
| `featheragents verify build <id>` | After build, before critic | Git scope (scope creep detection), TypeScript, tests, done criteria status |
| `featheragents verify critic <id>` | After critic, before sync | Review notes non-empty, `## Blockers` section present |

**Scope creep detection** is the differentiator. When a build agent touches files outside the task's `## Files` list, `verify_phase` flags it before the critic ever sees the diff. No other tool catches this.

**Agents call it too.** The `verify_phase` MCP tool gives build agents the same gate over JSON-RPC. The build skill instructs the agent to call `mcp__featheragents__verify_phase` before `write_handoff`. If it fails, the agent fixes the issue — it never leaves broken code for the critic.

**Flags:**
- `--json` — machine-readable output
- `--fix` — advisory mode: TypeScript failures downgraded to warnings, exits 0
- `--base <ref>` — git ref for scope check (default: `HEAD`)

---

## Quick Start

```bash
# In your project directory:
npx featheragents init
```

The interactive wizard will ask:
- Project name
- Which coding clients (Claude Code, OpenCode, or both)
- Model preset (balanced / low-cost / high-quality / local-first)
- Integrations (Linear, GitHub, Context7, web search)

Then it scaffolds everything and registers the MCP server automatically.

```bash
# Verify the setup:
featheragents doctor

# Start your first task:
featheragents task start FEAT-001

# Work in Claude Code or OpenCode — /frame, /build, /critic, /sync are ready
```

### Install globally

```bash
npm install -g featheragents
featheragents init
```

### Model presets

| Preset | Frame | Build | Critic | Sync |
|--------|-------|-------|--------|------|
| `balanced` | Sonnet | Sonnet | o3-mini | Haiku |
| `low-cost` | Haiku | Sonnet | Haiku | Haiku |
| `high-quality` | Opus | Sonnet | o3 | Sonnet |
| `local-first` | Qwen3 (Ollama) | Qwen3 | Qwen3 | Qwen3 |
| `manual` | you choose | you choose | you choose | you choose |

Use `--preset <name>` with `featheragents init` to skip the interactive selector.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `featheragents init` | Scaffold project structure, install skills, register MCP |
| `featheragents doctor` | Health check — verify config, files, MCP registration |
| `featheragents task start <id>` | Create and activate a task |
| `featheragents task sync` | Show current task status and progress |
| `featheragents task log <id>` | Full timeline for a task — progress, handoff, review notes |
| `featheragents verify frame <id>` | Gate: task file completeness before build |
| `featheragents verify build <id>` | Gate: git scope + TypeScript + tests before critic |
| `featheragents verify critic <id>` | Gate: review notes completeness before sync |
| `featheragents handoff write` | Write a role-to-role handoff note |
| `featheragents review prepare` | Generate a review checklist from task progress |
| `featheragents mcp install` | Re-register the MCP server with configured clients |
| `featheragents skills install` | Regenerate skill files from current config |

Most commands support `--help` for flags and non-interactive options (e.g. `--from`, `--to`, `--notes` for `handoff write`).

---

## MCP Tools

The local MCP server exposes 12 tools to your coding agents. Register once via `featheragents init` or `featheragents mcp install`, then every model in your workflow can read and write shared state.

| Tool | What it does |
|------|-------------|
| `get_project_brief` | Project name, active task, model assignments, enabled integrations |
| `get_active_focus` | Current task details and the latest handoff note |
| `get_task` | Full task file by ID — goal, files, done criteria, progress log |
| `list_tasks` | All tasks with status — shows dependency annotations |
| `start_task` | Create or activate a task — warns if dependencies are unmet |
| `append_progress` | Add a timestamped progress entry to the active task |
| `write_handoff` | Write a handoff note from one role to another |
| `record_review_notes` | Attach review findings (bugs, mismatches, edge cases) to a task |
| `record_decision` | Persist a named architectural decision with rationale |
| `get_diff` | Scoped git diff for the current task's files — use in critic sessions instead of manual `git diff` |
| `prepare_context_pack` | Single-call role-specific context bundle (goal + diff + handoff + conventions) |
| `verify_phase` | Deterministic phase gate — scope check, TypeScript, tests. Call before `write_handoff`. |

The server runs as a local stdio process — no daemon, no port, no hosted service. It's spawned by your client (Claude Code or OpenCode) on demand.

---

## Architecture

```
your-project/
├── .claude/
│   ├── commands/                # Slash commands (/frame /build /critic /sync)
│   └── settings.local.json      # Claude Code MCP registration
│
├── .opencode/
│   ├── agents/                  # OpenCode agent definitions (builder, critic, syncer)
│   └── opencode.json            # OpenCode MCP registration
│
├── .project-state/
│   └── state.json               # Shared project state (read/written by MCP server)
│
├── project-docs/
│   ├── context/                 # Architecture, conventions, decisions
│   ├── active/                  # Current focus doc, latest handoff
│   └── tasks/                   # Individual task files (FEAT-001.md, etc.)
│
└── featheragents/
    └── config.json              # Project config (clients, models, integrations)
```

**featheragents itself** (`node_modules/featheragents/dist/`):

```
dist/
  cli.js      # featheragents binary (Node 22+, ESM)
  server.js   # MCP server (stdio transport)
```

---

## What Gets Installed

`featheragents init` writes the following into your project (skips existing files by default):

- **`.claude/commands/`** — four compact skill files for Claude Code
  - `/frame` — plan a task in one pass, no padding
  - `/build` — implement with minimal context
  - `/critic` — structured diff review
  - `/sync` — close the loop, update state
- **`.opencode/agents/`** — builder, critic, syncer agent definitions
- **`project-docs/`** — minimal markdown system for context and handoffs
- **`.project-state/state.json`** — initial empty state
- **`featheragents/config.json`** — your configuration
- **`.claude/settings.local.json`** — MCP server registration (merged, not overwritten)
- **`.opencode/opencode.json`** — MCP + agent registration (merged, not overwritten)

---

## Philosophy

**Token waste is the real problem.** The agentic coding tools that exist today fail in a predictable way: they treat context as free. Giant planning phases. Every agent re-reads the full repo. Critic passes that see thousands of lines irrelevant to the change. These aren't features — they're leaks.

FeatherAgents is built around a single constraint: **each model sees only what it needs to do its job.**

- Frame agent reads: task goals, relevant files, done criteria. Not the whole codebase.
- Build agent reads: the task file + files it's editing. Not the design doc.
- Critic reads: the diff + task file. Not the implementation history.
- Sync reads: progress log. Not the code.

This isn't a new methodology. It's just applying basic engineering discipline — separation of concerns — to how you spend tokens.

**No required SaaS.** The MCP server is a local stdio process. State lives in a JSON file in your repo. Nothing phones home. You own the data.

**No rigid pipeline.** Skip stages. Add stages. Use one model for everything or five for different roles. The scaffold sets a sensible default; your project overrides it.

---

## Requirements

- Node.js 22+
- Claude Code and/or OpenCode (for the slash commands and agents)
- The models you choose in `featheragents init` (API keys managed by your client)

---

## License

MIT — see [LICENSE](LICENSE)
