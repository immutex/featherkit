<div align="center">

# 🪶 featherkit

**Lean multi-model agentic coding — without the ceremony**

*Coordinate frontier models. Keep token costs low. Ship faster.*

[![npm version](https://img.shields.io/npm/v/%401mmutex%2Ffeatherkit?color=blue&label=npm)](https://www.npmjs.com/package/@1mmutex/featherkit)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/node/v/%401mmutex%2Ffeatherkit?color=brightgreen)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/immutex/featherkit?style=social)](https://github.com/immutex/featherkit)

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Real-world Usage](#real-world-usage) · [Phase Gates](#deterministic-phase-gates) · [CLI Reference](#cli-reference) · [MCP Tools](#mcp-tools) · [Architecture](#architecture) · [Philosophy](#philosophy)

</div>

---

## The Problem

Multi-model agentic workflows in practice look like this:

| Without featherkit | With featherkit |
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

FeatherKit installs a lightweight 4-stage loop into your project. Models follow it using Claude Code skills and OpenCode agents. A local MCP server holds shared state so no information is lost between steps.

```
┌─────────────────────────────────────────────────────────────────┐
│                     featherkit loop                          │
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

## Real-world Usage

### Do you need two terminal windows open at once?

No. Claude Code and OpenCode don't need to run simultaneously. The MCP server is not a shared background daemon — each client spawns its own process on demand. Shared state lives in `state.json` on disk, so switching between tools is as simple as closing one and opening the other. The next model picks up exactly where the last one left off.

### Single-model setup (Claude Code only)

The simplest setup: one tool, all four phases, one model (or different models per phase if you configure it).

```
Claude Code terminal
│
├── /frame    → plan the task, write done criteria
├── /build    → implement
├── /critic   → review the diff
└── /sync     → close the task, update state
```

Every slash command uses the MCP server to read and write shared state. You just work through the phases in sequence in a single Claude Code session.

### Multi-model setup (Claude Code + OpenCode)

The typical pattern: use Claude Code for planning and critique, OpenCode for implementation. You switch between them phase by phase — no overlap required.

```
Step 1 — Claude Code
  /frame
  → reads task goal, writes plan + done criteria to state.json

Step 2 — OpenCode  (open a new terminal, or switch your IDE agent)
  builder agent auto-activates
  → reads the task + handoff from state.json via MCP
  → implements, calls verify_phase, writes handoff back to state.json

Step 3 — Claude Code  (back to your original terminal)
  /critic
  → reads the diff + handoff from state.json via MCP
  → writes review notes

Step 4 — either tool
  /sync  (Claude Code)  or  syncer agent  (OpenCode)
  → closes the task
```

The two tools never talk to each other directly. `state.json` is the handoff mechanism. When OpenCode's builder agent finishes and calls `write_handoff`, that file is sitting on disk ready for the Claude Code critic to pick up — no copy-paste, no context re-feeding.

### What "switching tools" actually looks like

```bash
# Terminal 1 (Claude Code) — frame the task
claude  # open Claude Code in your project
# run /frame inside the session

# Terminal 2 (OpenCode) — build
opencode  # open OpenCode in the same project directory
# the builder agent picks up from state.json automatically

# Back to Terminal 1 (Claude Code) — critique
# run /critic inside the session
```

Or if you prefer a single terminal: finish your Claude Code session, close it, open OpenCode, finish, re-open Claude Code. The state persists between invocations.

### Mixing models within a single tool

If you're only using Claude Code but configured different models per role (e.g. Sonnet 4.6 for build, Opus 4.7 for frame), the skills remain the same — you just run each slash command with the model you want active in your Claude Code session. The MCP state bridges the gap between sessions.

---

## Deterministic Phase Gates

The headline feature. Every other agentic workflow tool sends work directly from one AI to the next — if the build agent changed the wrong files or TypeScript is broken, the critic finds out the hard way after spending 10k tokens.

**featherkit intercepts.** Before a build agent writes its handoff, it calls `verify_phase` — a zero-cost, zero-AI mechanical check:

```
featherkit verify build FEAT-001

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
| `featherkit verify frame <id>` | After framing, before build | Task file exists, Goal/Files/Done Criteria/Risks non-empty |
| `featherkit verify build <id>` | After build, before critic | Git scope (scope creep detection), TypeScript, tests, done criteria status |
| `featherkit verify critic <id>` | After critic, before sync | Review notes non-empty, `## Blockers` section present |

**Scope creep detection** is the differentiator. When a build agent touches files outside the task's `## Files` list, `verify_phase` flags it before the critic ever sees the diff. No other tool catches this.

**Agents call it too.** The `verify_phase` MCP tool gives build agents the same gate over JSON-RPC. The build skill instructs the agent to call `mcp__featherkit__verify_phase` before `write_handoff`. If it fails, the agent fixes the issue — it never leaves broken code for the critic.

**Flags:**
- `--json` — machine-readable output
- `--fix` — advisory mode: TypeScript failures downgraded to warnings, exits 0
- `--base <ref>` — git ref for scope check (default: `HEAD`)

---

## Quick Start

```bash
# In your project directory:
npx @1mmutex/featherkit init
```

The interactive wizard will ask:
- Project name
- Which coding clients (Claude Code, OpenCode, or both)
- Model preset (balanced / low-cost / high-quality / local-first)
- Integrations (Linear, GitHub, Context7, web search)

Then it scaffolds everything and registers the MCP server automatically.

```bash
# Verify the setup:
npx featherkit doctor

# Start your first task:
npx featherkit task start FEAT-001

# Work in Claude Code or OpenCode — /frame, /build, /critic, /sync are ready
```

### Install globally

```bash
npm install -g @1mmutex/featherkit
featherkit init
```

### Model presets

| Preset | Frame | Build | Critic | Sync |
|--------|-------|-------|--------|------|
| `balanced` | Sonnet 4.6 | Sonnet 4.6 | GPT-5.4 | Haiku 4.5 |
| `low-cost` | Haiku 4.5 | Sonnet 4.6 | Haiku 4.5 | Haiku 4.5 |
| `high-quality` | Opus 4.7 | Sonnet 4.6 | GPT-5.4 | Sonnet 4.6 |
| `open-source` | Qwen3.6 Plus | Qwen3.6 Plus | GLM-5.1 | Qwen3.6 Plus |
| `custom` | you choose | you choose | you choose | you choose |

Open-source models are routed via OpenRouter. Custom selection presents a menu of all supported models — no manual ID entry required.

Use `--preset <name>` with `featherkit init` to skip the interactive selector.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `featherkit init` | Scaffold project structure, install skills, register MCP |
| `featherkit doctor` | Health check — verify config, files, MCP registration |
| `featherkit task start <id>` | Create and activate a task |
| `featherkit task sync` | Show current task status and progress |
| `featherkit task log <id>` | Full timeline for a task — progress, handoff, review notes |
| `featherkit verify frame <id>` | Gate: task file completeness before build |
| `featherkit verify build <id>` | Gate: git scope + TypeScript + tests before critic |
| `featherkit verify critic <id>` | Gate: review notes completeness before sync |
| `featherkit handoff write` | Write a role-to-role handoff note |
| `featherkit review prepare` | Generate a review checklist from task progress |
| `featherkit mcp install` | Re-register the MCP server with configured clients |
| `featherkit skills install` | Regenerate skill files from current config |

Most commands support `--help` for flags and non-interactive options (e.g. `--from`, `--to`, `--notes` for `handoff write`).

---

## MCP Tools

The local MCP server exposes 12 tools to your coding agents. Register once via `featherkit init` or `featherkit mcp install`, then every model in your workflow can read and write shared state.

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
└── featherkit/
    └── config.json              # Project config (clients, models, integrations)
```

**featherkit itself** (`node_modules/@1mmutex/featherkit/dist/`):

```
dist/
  cli.js      # featherkit binary (Node 22+, ESM)
  server.js   # MCP server (stdio transport)
```

---

## What Gets Installed

`featherkit init` writes the following into your project (skips existing files by default):

- **`.claude/commands/`** — four compact skill files for Claude Code
  - `/frame` — plan a task in one pass, no padding
  - `/build` — implement with minimal context
  - `/critic` — structured diff review
  - `/sync` — close the loop, update state
- **`.opencode/agents/`** — builder, critic, syncer agent definitions
- **`project-docs/`** — minimal markdown system for context and handoffs
- **`.project-state/state.json`** — initial empty state
- **`featherkit/config.json`** — your configuration
- **`.claude/settings.local.json`** — MCP server registration (merged, not overwritten)
- **`.opencode/opencode.json`** — MCP + agent registration (merged, not overwritten)

---

## Philosophy

**Token waste is the real problem.** The agentic coding tools that exist today fail in a predictable way: they treat context as free. Giant planning phases. Every agent re-reads the full repo. Critic passes that see thousands of lines irrelevant to the change. These aren't features — they're leaks.

FeatherKit is built around a single constraint: **each model sees only what it needs to do its job.**

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
- The models you choose in `featherkit init` (API keys managed by your client)

---

## License

MIT — see [LICENSE](LICENSE)
