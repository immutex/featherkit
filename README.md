<div align="center">

# 🪶 featherkit

**Autonomous multi-model coding — orchestrated, observed, remembered.**

*Coordinate frontier models. Approval gates you actually control. A dashboard that shows everything.*

[![npm version](https://img.shields.io/npm/v/%401mmutex%2Ffeatherkit?color=blue&label=npm)](https://www.npmjs.com/package/@1mmutex/featherkit)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/node/v/%401mmutex%2Ffeatherkit?color=brightgreen)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/immutex/featherkit?style=social)](https://github.com/immutex/featherkit)

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Orchestrator](#orchestrator) · [Dashboard](#dashboard) · [Memory System](#memory-system) · [CLI Reference](#cli-reference) · [MCP Tools](#mcp-tools) · [Architecture](#architecture)

</div>

---

## What Is featherkit?

featherkit is an agentic coding pipeline for teams and solo developers who want to run multiple frontier models on a single task — automatically, with checkpoints you control, and a live dashboard to watch it happen.

You configure which model handles each role. The orchestrator drives them through a **Frame → Build → Critic → Sync** loop, invoking each one in sequence, injecting memory context from prior sessions, and surfacing approval gates at the moments that matter. A web dashboard shows you everything in real time: current task, live agent output, phase progress, memory graph, connections.

**It is not a hosted service.** Everything runs locally. State lives in JSON files in your repo. No API key goes to featherkit — only to the models you choose.

---

## How It Works

Every task moves through four phases. You can run these manually (slash commands in Claude Code, agent invocations in OpenCode) or hand the wheel to the orchestrator and let it drive.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      featherkit loop                                │
│                                                                     │
│   /frame            /build            /critic           /sync       │
│   ──────            ──────            ────────          ──────      │
│   Read context      Implement         Review the diff   Close out   │
│   Write task file   Call verify_phase Flag issues       Update state│
│   Done criteria     mark_phase_        mark_phase_       Handoff    │
│   Risks             complete           complete          written     │
│                                                                     │
│   ↓                 ↓                 ↓                 ↓           │
│ task.md ready   code shipped     verdict: pass/     task done       │
│                                  warn/fail                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Critic verdict controls the loop.** If the critic emits `fail`, the orchestrator loops back to build automatically. An LLM router reads the critic output and decides `advance / loopback / blocked` — replacing the brittle `verdict === 'fail'` hard-code with genuine judgment.

**Memory threads across sessions.** Before each phase, the runner retrieves relevant context from the memory store and injects it into the system prompt. After each phase, new memories are extracted, scored for worthiness, deduplicated, and committed. The next task starts knowing what the last one learned.

**Phase gates are deterministic.** Before handing off to the next model, `verify_phase` runs TypeScript, tests, and a scope check — zero tokens, zero AI. Broken builds never reach the critic.

---

## Quick Start

```bash
# In your project directory:
npx @1mmutex/featherkit init
```

The init wizard asks:
- Project name
- Which coding clients (Claude Code, OpenCode, or both)
- Model assignments per role (frame / build / critic / sync)
- Integrations (GitHub, Context7, web search, Playwright)

It scaffolds everything: skill files, agent definitions, config, MCP registration, project-docs structure.

```bash
# Verify setup:
feather doctor

# Check provider auth:
feather auth status

# Start the dashboard:
feather serve   # prints: Dashboard: http://localhost:7721?token=<token>
# Open that URL directly — no token setup required

# Run a task (manual):
feather task start FEAT-001
# then run /frame, /build, /critic, /sync in Claude Code

# Or let the orchestrator drive it:
feather orchestrate --task FEAT-001
```

### Install globally

```bash
npm install -g @1mmutex/featherkit
# or
bun add -g @1mmutex/featherkit
```

---

## Orchestrator

The orchestrator is featherkit's autonomous pipeline. It picks up tasks from `state.json`, runs each phase by spawning the configured model, watches for `mark_phase_complete`, and advances the loop — all without you touching a terminal.

```bash
feather orchestrate                    # loop until no pending tasks
feather orchestrate --task FEAT-001    # target a specific task
feather orchestrate --once             # run one task then exit
feather orchestrate --dry-run          # print what would run, don't spawn
feather orchestrate --no-tui           # headless mode (CI / pipes)
```

### Approval Gates

Two phases pause for human review by default:

| Gate | Default mode | What happens |
|------|-------------|--------------|
| After **frame** | `editor` | Opens your `$EDITOR` on the task file. You read the plan, edit if needed, save and quit. Orchestrator resumes. |
| Before **sync** | `prompt` | Prints `git diff --stat`, asks "Proceed with sync? (y/N)". |

Modes are per-gate, configurable in `featherkit/config.json`:

```json
"approvalGate": {
  "frame": "editor",   // "editor" | "inline" | "pause" | "auto"
  "sync":  "prompt"    // "prompt" | "pause" | "auto"
}
```

`pause` writes `awaiting-approval` to state and exits — resume later with `feather orchestrate --task <id>`. `auto` skips the gate entirely (CI use-case).

Approve or reject without resuming the orchestrator:

```bash
feather approve FEAT-001             # record approval, prompt to resume
feather approve FEAT-001 --reject    # mark task blocked
```

### TUI Dashboard (terminal)

When running interactively, the orchestrator renders a live terminal dashboard via `@mariozechner/pi-tui`:

```
┌──────────────────────────────────────────────────────────────┐
│  FeatherKit Orchestrator — featheragents                     │
│  Task: mem-d — Wire memory into orchestrator loop            │
├──────────────────────────────────────────────────────────────┤
│  frame ✓    build ⋯    critic ·    sync ·                    │
├──────────────────────────────────────────────────────────────┤
│  > Retrieving memory context for session abc123…             │
│  > Running /build skill on task mem-d…                       │
│  > mcp__featherkit__append_progress called                   │
├──────────────────────────────────────────────────────────────┤
│  History                                                     │
│  ✓ frame   12:14  45s   approved (edited)                    │
│  ⋯ build   12:15  running…                                   │
└──────────────────────────────────────────────────────────────┘
```

### LLM Router

After every critic phase, a router LLM reads the critic output and decides whether to advance or loop back. It runs via `claude --print` (no separate API key — uses your existing Claude Pro/Max plan).

```json
"router": {
  "enabled": true,
  "model": "haiku",
  "timeoutMs": 60000
}
```

If the router times out or errors, it falls back to reading `PhaseCompletion.verdict` from state.

### Multi-model Routing

The orchestrator checks which provider is configured for each role and routes accordingly:

- **`anthropic`** provider → spawns `claude --print` (Claude CLI harness; uses Claude Pro/Max plan, no API key needed)
- **Any other provider** → routes through the Pi agent harness (`@mariozechner/pi-coding-agent`), which uses OAuth credentials from `~/.pi/auth.json`

Your `featherkit/config.json` assigns models per role:

```json
"models": [
  { "role": "frame",  "provider": "anthropic", "model": "claude-sonnet-4-6" },
  { "role": "build",  "provider": "openai",    "model": "gpt-5.4" },
  { "role": "critic", "provider": "openrouter", "model": "z-ai/glm-5.1" },
  { "role": "sync",   "provider": "openai",    "model": "gpt-5.4-mini" }
]
```

---

## Dashboard

`feather serve` starts a local HTTP + WebSocket server (`127.0.0.1:7721` by default) and prints the full URL with auth token:

```bash
$ feather serve
Dashboard: http://localhost:7721?token=<32-byte-hex>
```

Open that URL — the token is injected automatically, no `.env` setup needed.

```bash
feather serve           # start on default port
feather serve --port 8080
```

The dashboard has five views:

### Home
Live event stream from the orchestrator. Phase start/complete events, stdout lines from the running model, task completion markers — all arriving over WebSocket without polling.

### Projects / Kanban
All tasks in your `state.json`, displayed as cards. Drag between columns (`pending → active → done`) — the move persists to disk via `PATCH /api/tasks/:id`. Unmet dependencies block the drag with an error toast and snap the card back.

### Workflow
A React Flow canvas showing your phase DAG. Drag nodes to reorder. Edit model assignments and gate modes in the side panel. Save writes back to `project-docs/workflows/default.json` and the orchestrator picks up the new ordering on next run.

### Memory
An Obsidian-style graph of everything the memory system has learned: semantic memories, episodic events, procedural patterns, structured summaries. Filter by type, scope, or agent. Click a node to open the inspector — content, confidence score, salience, source, full retrieval history. Timeline view shows memories in chronological order with supersession chains.

### Connections
Provider status at a glance. Connect or disconnect model providers. Add, edit, and test MCP server entries. Install Pi extension packages.

---

## Memory System

Every phase leaves a memory. Every task draws on memories from prior work. This is the difference between agents that start from zero and agents that compound their understanding of your codebase over time.

### How It Works

**Retrieval (before each phase):**
1. Parse the phase prompt to detect intent and entities
2. Run three parallel retrieval channels: keyword (BM25-style), vector (embedding similarity), scoped (session/branch/repo scope)
3. Rerank results by relevance + recency + salience
4. Assemble a `<memory>...</memory>` block within a token budget
5. Inject into the model's system prompt

**Write path (after each phase):**
1. Extract memory candidates from the agent's output (via `claude --print`)
2. Score each candidate for worthiness (relevance, actionability, specificity)
3. Deduplicate against existing memories (semantic + exact match)
4. Commit survivors to SQLite with metadata (type, scope, entities, confidence)

### Memory Types

| Type | What it captures |
|------|-----------------|
| `semantic` | Architectural facts, patterns, design decisions |
| `episodic` | What happened during a specific task/phase |
| `procedural` | How to do something — steps, commands, sequences |
| `summary` | Compressed overview of a long session or task |

### Storage

SQLite database at `.project-state/memory.db`. Fully local, no cloud sync, no embeddings API required (keyword retrieval is the primary channel; vector retrieval is optional and uses local embeddings).

### MCP Tools

Agents can read and write memories directly during a session:

```
mcp__featherkit__retrieve_memory  { query, scope?, type?, limit? }
mcp__featherkit__write_memory     { type, title, content, scope, entities? }
mcp__featherkit__list_memories    { scope?, type?, isActive? }
```

Memory tools are only registered when `config.memory.enabled = true`.

---

## Authentication

### Claude (Anthropic)
featherkit invokes Claude through the Claude Code CLI (`claude --print`). Authentication is your existing Claude login — no API key needed, your Pro or Max plan is used.

```bash
claude auth login    # authenticate Claude Code CLI
feather auth status  # verify featherkit sees it as connected
```

### Other Providers (via Pi)
Non-Anthropic providers (OpenAI, Gemini, Groq, etc.) authenticate through the Pi ecosystem:

```bash
feather auth status                 # list all providers + auth state
feather auth login openai           # triggers pi login openai
feather auth login google-gemini    # triggers pi login google-gemini
```

Credentials are stored in `~/.pi/auth.json` by the Pi agent runtime. featherkit reads them at runtime via `AuthStorage` — never writes them itself.

### Package Management

Pi extension packages add providers, skills, and MCP servers:

```bash
feather pkg add npm:@pi-packages/openai-codex
feather pkg list                    # show installed packages + providers + skills
feather pkg remove npm:@pi-packages/openai-codex
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `feather init` | Scaffold project, install skills, register MCP server |
| `feather doctor` | Health check — config, files, MCP registration, claude/pi binaries |
| `feather serve [--port]` | Start local HTTP+WS dashboard server |
| `feather orchestrate [--task] [--once] [--dry-run] [--no-tui]` | Autonomous multi-model pipeline |
| `feather approve <id> [--reject]` | Approve or reject a paused gate |
| `feather auth status` | Show provider auth status |
| `feather auth login <provider>` | Authenticate a provider |
| `feather auth logout <provider>` | Remove provider credentials |
| `feather task start <id>` | Create and activate a task |
| `feather task sync` | Current task status and progress |
| `feather task log <id>` | Full task timeline |
| `feather verify frame <id>` | Gate: task file completeness |
| `feather verify build <id>` | Gate: git scope + TypeScript + tests |
| `feather verify critic <id>` | Gate: review notes present |
| `feather handoff write` | Write a role-to-role handoff note |
| `feather review prepare` | Generate review checklist from task progress |
| `feather mcp install` | Re-register MCP server with configured clients |
| `feather skills install` | Regenerate skill files from current config |
| `feather pkg add <source>` | Install a Pi extension package |
| `feather pkg list` | List installed packages, providers, skills |
| `feather pkg remove <source>` | Remove a Pi extension package |

All commands support `--help`.

---

## MCP Tools

The featherkit MCP server exposes tools to every agent in your workflow over JSON-RPC (stdio transport). Registered once via `feather init`, available to every Claude Code session and Pi agent session in your project.

| Tool | Description |
|------|-------------|
| `get_project_brief` | Project summary, active task, model config, integrations |
| `get_active_focus` | Current task + latest handoff |
| `get_task` | Full task file by ID |
| `list_tasks` | All tasks with status and dependency annotations |
| `start_task` | Create or activate a task |
| `append_progress` | Timestamped progress entry on the active task |
| `write_handoff` | Role-to-role handoff note |
| `record_review_notes` | Attach critic findings to a task |
| `record_decision` | Persist an architectural decision with rationale |
| `get_diff` | Scoped git diff for current task's files |
| `prepare_context_pack` | Single-call context bundle for a specific role |
| `verify_phase` | Deterministic gate: scope check, TypeScript, tests |
| `mark_phase_complete` | Signal phase completion (called by agents, triggers loop advancement) |
| `retrieve_memory` | Query the memory store *(requires `memory.enabled: true`)* |
| `write_memory` | Commit a memory directly *(requires `memory.enabled: true`)* |
| `list_memories` | Browse memories by scope/type *(requires `memory.enabled: true`)* |

---

## Phase Gates

Before any model hands off to the next, `verify_phase` runs three deterministic checks:

```
feather verify build FEAT-001

Verifying build phase for FEAT-001...

✓ Task file — project-docs/tasks/FEAT-001.md
✓ Goal section — non-empty
✓ Files section — 3 file(s) listed
✓ Done Criteria — 4 items
✓ Scope: src/memory/write/commit.ts — in task file
✓ Scope: src/memory/write/dedup.ts — in task file
⚠ Scope: test/memory/write.test.ts — not in task file
✓ TypeScript — tsc --noEmit — 0 errors
✓ Tests — vitest run — 376 passed

Verdict: PASS WITH WARNINGS
  ⚠ test/memory/write.test.ts changed outside task scope
```

| Gate | When | Checks |
|------|------|--------|
| `verify frame <id>` | After framing, before build | Task file, Goal / Files / Done Criteria / Risks non-empty |
| `verify build <id>` | After build, before critic | Scope creep, TypeScript, tests |
| `verify critic <id>` | After critic, before sync | Review notes non-empty, Blockers section present |

Scope creep detection is the key differentiator: files touched outside the task's `## Files` list are flagged before the critic ever sees the diff.

---

## Architecture

### Project layout (your codebase)

```
your-project/
├── .claude/
│   ├── commands/           # /frame /build /critic /sync slash commands
│   └── CLAUDE.md           # FeatherKit workflow context for Claude Code
│
├── .opencode/
│   ├── agents/             # builder, critic, syncer agent definitions
│   └── opencode.json       # OpenCode MCP + agent registration
│
├── .project-state/
│   ├── state.json          # Shared task state (atomic writes)
│   ├── memory.db           # SQLite memory store
│   ├── events.jsonl        # Append-only orchestrator event log (→ WS relay)
│   └── dashboard.token     # Bearer token for feather serve API
│
├── project-docs/
│   ├── context/            # architecture.md, conventions.md
│   ├── active/             # current-focus.md, latest-handoff.md
│   ├── tasks/              # FEAT-001.md, FEAT-002.md, …
│   ├── decisions/          # Architectural decision records
│   └── workflows/          # default.json — phase DAG definition
│
└── featherkit/
    └── config.json         # Project config (models, integrations, orchestrator)
```

### featherkit package (`dist/`)

```
dist/
  cli.js      # feather binary — all CLI commands
  server.js   # MCP server — stdio transport, spawned by Claude Code / OpenCode
```

### Dashboard (`featherkit-dashboard/`)

React SPA (Vite, TypeScript). Served as static files by `feather serve`. Talks to the HTTP API and a WebSocket event stream. No SSR, no server components.

Stack: React 18, TanStack Query v5, Zustand, React Flow (`@xyflow/react`), `@dnd-kit` (kanban), `lucide-react`.

### Data flow

```
feather orchestrate
  │
  ├── reads/writes state.json (via state-io.ts)
  ├── appends events.jsonl (OrchestratorEvent JSON lines)
  ├── spawns claude --print (Anthropic provider)
  └── calls piLoader.invokeProvider (other providers via Pi)

feather serve
  │
  ├── serves static dashboard files
  ├── exposes GET/PATCH /api/* (reads state.json)
  ├── tails events.jsonl → broadcasts over WebSocket
  └── manages .mcp.json (connections CRUD)

dist/server.js (MCP server)
  │
  ├── spawned by Claude Code / OpenCode per-session (stdio)
  └── reads/writes state.json + memory.db
```

---

## Configuration

`featherkit/config.json` is the single source of truth for your project setup.

```json
{
  "version": 1,
  "projectName": "my-project",
  "clients": "both",
  "models": [
    { "role": "frame",  "provider": "anthropic", "model": "claude-sonnet-4-6" },
    { "role": "build",  "provider": "openai",    "model": "gpt-5.4" },
    { "role": "critic", "provider": "openrouter", "model": "z-ai/glm-5.1" },
    { "role": "sync",   "provider": "openai",    "model": "gpt-5.4-mini" }
  ],
  "integrations": {
    "github": true,
    "context7": true,
    "webSearch": true,
    "playwright": false
  },
  "memory": {
    "enabled": false
  },
  "orchestrator": {
    "enabled": false,
    "mode": "manual",
    "approvalGate": {
      "frame": "editor",
      "sync": "prompt"
    },
    "router": {
      "enabled": true,
      "model": "haiku",
      "timeoutMs": 60000
    }
  }
}
```

All Anthropic provider roles use the Claude CLI harness — no API key. All other providers authenticate via Pi.

---

## Manual vs Autonomous

You don't have to use the orchestrator. The slash commands (`/frame`, `/build`, `/critic`, `/sync`) work exactly as before — just run them yourself in Claude Code, one at a time, switching models however you like.

The orchestrator is opt-in: set `"orchestrator": { "enabled": true }` in config, then `feather orchestrate`. Everything else stays the same.

| Mode | What you do | What featherkit does |
|------|-------------|---------------------|
| Manual | Run `/frame`, `/build`, `/critic`, `/sync` yourself | Holds state, gates, MCP tools |
| Orchestrated | `feather orchestrate` | Drives the full loop, approval gates, memory injection, routing |

---

## Requirements

- Node.js 22+ or Bun 1.x
- Claude Code CLI (`claude`) — for Anthropic provider roles and the router
- Pi CLI (`pi`) — only for non-Anthropic providers
- The models you configure (authenticated via Claude CLI or Pi)

---

## License

MIT — see [LICENSE](LICENSE)
