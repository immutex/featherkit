# FeatherAgents

Lean multi-model workflow CLI — bootstraps project structure, skills, and a local MCP server for coordinating coding agents across Claude Code and OpenCode.

## Stack
- **Runtime:** Bun (dev), Node 22+ (production)
- **Language:** TypeScript (strict, ESM-only)
- **CLI:** commander + @inquirer/prompts
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **Validation:** zod v4 (Standard Schema — import from `zod/v4`)
- **Build:** tsup (two entries: cli + mcp server)
- **Test:** vitest

## Commands
```bash
bun install          # install deps
bun run build        # build dist/cli.js + dist/server.js
bun test             # run tests
bun run dev          # watch mode
```

## Conventions
- ESM only. Use `.js` extensions in all import specifiers.
- Use `zod/v4` everywhere (not `zod` — the MCP SDK requires Standard Schema).
- No `console.log` in `src/mcp/` — stdout is the JSON-RPC transport. Use `console.error` for server logs.
- Templates are pure functions: `(config: FeatherConfig) => string`. No side effects.
- Config generators must deep-merge with existing files, never overwrite.
- Atomic writes for state.json (temp file + rename).
- Keep dependencies minimal. No heavy frameworks.

## Structure
```
src/
  cli.ts              # CLI entry point (commander)
  commands/           # One file per command group
  config/             # Zod schemas, defaults, loader
  templates/          # Template functions (TS → string)
  generators/         # Client config generators
  mcp/
    server.ts         # MCP server entry (separate bundle)
    state-io.ts       # Shared state read/write
    tools/            # One file per MCP tool
  utils/              # fs helpers, logger
test/                 # vitest tests
tasks/                # Implementation task files
```

## Key Files
- `src/config/schema.ts` — source of truth for all types
- `src/templates/index.ts` — template manifest (config → file list)
- `src/mcp/state-io.ts` — shared between CLI and MCP server
