# featheragents

The no-bullshit workflow for multi-model agentic coding.

Stop burning tokens on giant spec pipelines, duplicated context, and forced ceremony. FeatherAgents gives you a lean workflow that keeps frontier models fast by giving them only what they need.

## What it does

- Scaffolds project structure for multi-model coding workflows
- Installs compact skills/prompts for Claude Code and OpenCode
- Runs a tiny local MCP server for shared project state
- Generates client configs automatically
- Wires optional integrations (GitHub, Linear, Context7, web search)
- Keeps everything local-first — no required SaaS

## What it doesn't do

- Proxy model traffic
- Replace Claude Code or OpenCode
- Force a rigid methodology
- Require a hosted backend
- Burn tokens on over-planning

## Install

```bash
npx featheragents init
```

Or install globally:

```bash
npm install -g featheragents
featheragents init
```

## Quick Start

```bash
# 1. Initialize in your project
featheragents init

# 2. Start a task
featheragents task start FEAT-001

# 3. Work in your coding agent (Claude Code, OpenCode)
#    Skills and MCP tools are ready to use

# 4. Sync state when done
featheragents task sync
```

## Workflow

FeatherAgents follows a lean 4-stage loop:

1. **Frame** — Short plan. Task summary, files, done criteria, risks. No giant specs.
2. **Build** — Implementation. Uses only task file + relevant code + selected tools.
3. **Critique** — GLM reviews the diff. Bugs, mismatches, missing tests, edge cases.
4. **Sync** — Update shared state. Task markdown, handoff notes, optional tracker sync.

Skip stages for tiny tasks. Add a final review stage for high-stakes changes.

## CLI Commands

| Command | Purpose |
|---------|---------|
| `featheragents init` | Scaffold project structure and config |
| `featheragents doctor` | Verify setup and dependencies |
| `featheragents task start <id>` | Create/activate a task |
| `featheragents task sync` | Show current task status |
| `featheragents handoff write` | Write handoff notes between roles |
| `featheragents review prepare` | Prepare review context |
| `featheragents mcp install` | Register MCP server with clients |
| `featheragents skills install` | Write/update skill files |

## Supported Clients

- **Claude Code** — primary planner/reviewer
- **OpenCode** — execution/critic (GPT, Codex, any model)
- Both clients can be used together or independently

## Architecture

```
Your Project/
  .claude/                    # Claude Code config + skills
  .opencode/                  # OpenCode config + agents
  .project-state/state.json   # Shared project state (via MCP)
  project-docs/               # Minimal markdown system
    context/                  # Architecture, conventions
    active/                   # Current focus, handoffs
    tasks/                    # Task files
  featheragents/config.json   # FeatherAgents config
```

The MCP server runs as a local stdio process — no daemon, no port, no hosted service.

## Token Efficiency

FeatherAgents is built around keeping token usage low:

- No large plans unless the task is large
- No restating the entire repo at every step
- Critic sees only the diff + task file
- Sync files stay compact and factual
- Exact file retrieval over large context blobs
- Skip stages for tiny edits

## License

MIT
