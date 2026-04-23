# Task: agents-a

## Goal
Wire the Agents view in the dashboard to real `featherkit/config.json` model data so users can see and edit which model runs each role — replacing the mock agent cards that show fictional configurations.

## Context
`featherkit-dashboard/src/views/Agents.tsx` is a fully-built UI (289 lines) for viewing and editing agent configurations per role, but it's seeded from `FK_DATA.agents` (hardcoded mock). The real source of truth is `config.models[]` in `featherkit/config.json` — each entry has `{ role, provider, model }`. There is no `/api/agents` route in the server and no query hook in the dashboard. The view has a working edit/delete/create interaction pattern already — it just needs real data wired in.

## Files
- **`src/server/routes/agents.ts`** *(new)* — implement `handleAgentsRoute`:
  - `GET /api/agents` → read `featherkit/config.json` via `loadConfig(cwd)`, return `config.models` as `{ models: ModelConfig[] }`.
  - `PUT /api/agents` → accept `{ models: ModelConfig[] }`, validate with `z.array(ModelConfigSchema)`, write back to `featherkit/config.json` atomically (read full config, replace `models`, write). Reject if `readOnly`.
- **`src/server/index.ts`** — import `handleAgentsRoute` and add dispatch before `notFound`.
- **`featherkit-dashboard/src/lib/queries.ts`** — add `useAgentsQuery()` (`GET /api/agents`) and `useUpdateAgents()` mutation (`PUT /api/agents`). Return type: `{ models: ApiModelConfig[] }` where `ApiModelConfig = { role: string; provider: string; model: string }`.
- **`featherkit-dashboard/src/views/Agents.tsx`** — replace `useState(FK_DATA.agents)` with `useAgentsQuery()`. Map `ApiModelConfig` to the existing `AgentConfig` shape the view expects (the view has `id`, `name`, `role`, `model`, `provider` — map `role` as `id` and `name`). Wire the Save action to `useUpdateAgents()`, sending the full updated models array. Remove all references to `FK_DATA.agents` and `FK_DATA.mcpServers` in this file.
- **`test/server/agents-route.test.ts`** *(new)* — unit test: mock a project with known config.models, call `handleAgentsRoute` for GET and PUT, assert correct JSON returned and config file updated.

## Done Criteria
- [ ] `GET /api/agents` returns `{ models: [{ role: 'frame', provider: 'anthropic', model: 'claude-sonnet-4-6' }, ...] }` matching the project's `featherkit/config.json`.
- [ ] `PUT /api/agents` with a modified models array updates `featherkit/config.json` and the next `GET /api/agents` reflects the change.
- [ ] `PUT /api/agents` on a read-only server returns 409.
- [ ] Agents view in the dashboard shows the real role/provider/model from config on load (no fictional "Aria" or "Axiom" agents from mock).
- [ ] Editing and saving a model change in the Agents view calls `PUT /api/agents` and the view reflects the updated state.
- [ ] `bun run build` passes. `bun test test/server/agents-route.test.ts` passes. `cd featherkit-dashboard && bun run build` passes.

## Risks
- The existing `AgentConfig` mock type has fields like `id`, `name`, `avatar`, `capabilities[]`, `tools[]` that don't exist in `ModelConfig`. The Agents view must be simplified to only render what the real data provides — strip out avatar/capabilities display rather than trying to fake them. The edit form should only expose role/provider/model.
- Writing back to `featherkit/config.json` must deep-merge — only replace the `models` key, preserve all other config fields. Use the same read-merge-write pattern as the generator functions.
- The `mcpServers` section of Agents.tsx (`allMcps = FK_DATA.mcpServers`) should be removed for now (that belongs to dash-e MCP CRUD). Remove the MCP section from this view entirely rather than leaving it on FK_DATA.

## Constraints
- Do not implement MCP server CRUD here — that's dash-e scope. Remove the MCP section from Agents.tsx.
- Config writes must use atomic temp-file-rename (or reuse the existing `saveConfig`/deep-merge helper if one exists — check `src/config/loader.ts` or generators).
- `GET /api/agents` must work even when `config.memory.enabled` is false — it reads from config, not SQLite.

## Depends on
- `dash-b` ✓ (server exists)
- `dash-c` ✓ (query hooks pattern established)
- `fix-a` ✓ (memory route wired — same pattern to follow)
