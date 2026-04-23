# Task: home-b

## Goal
Replace the hardcoded model names in the Home view's AgentRoster with real data from `featherkit/config.json` via the `/api/agents` endpoint — so the roster reflects what the user actually configured instead of always showing claude-sonnet-4-6 / gpt-5.4.

## Context
`featherkit-dashboard/src/views/Home.tsx` renders an `AgentRoster` component (line ~750) that reads from `BUILTIN_AGENTS` in `src/lib/builtin-agents.ts`. That file hardcodes model strings: `model: 'anthropic/claude-sonnet-4-6'` for frame, `model: 'openai/gpt-5.4'` for build, etc. A user who configures `--preset open-source` (Qwen3.6 + GLM-5.1) still sees the Anthropic/OpenAI names on the Home screen. `agents-a` added `useAgentsQuery()` which fetches real `config.models` — the roster just needs to read from it.

The token usage (`usageByRole`) is explicitly mocked and stays that way — there's no real metrics source yet. Only the model names need to be wired.

## Files
- **`featherkit-dashboard/src/views/Home.tsx`** *(modify `AgentRoster`)* —
  - Call `useAgentsQuery()` (already in `@/lib/queries`)
  - Map `models` from the query to the existing roster row shape: `{ role, name: role, model: data.model }` — the model string comes from the API response instead of `BUILTIN_AGENTS`
  - Keep the hardcoded `usageByRole` mock as-is (add a comment `// TODO: real metrics`)
  - If the query is loading or fails, fall back to `BUILTIN_AGENTS` so the roster always renders
  - Remove the `getBuiltInAgentByRole` import if it's only used in `AgentRoster`
- **`featherkit-dashboard/src/lib/builtin-agents.ts`** *(modify)* — keep the type definitions and `BUILTIN_AGENTS` array (still used as fallback), but export a helper `getModelForRole(models: ApiModelConfig[], role: string): string` that returns the real model string or falls back to the builtin default.

## Done Criteria
- [x] A project initialized with `--preset open-source` (Qwen3.6 / GLM-5.1 models) shows those model names in the Home AgentRoster instead of claude-sonnet-4-6.
- [x] A project initialized with `--preset balanced` (default) shows the expected Anthropic/OpenAI models.
- [x] When `/api/agents` returns an error or is loading, the roster falls back to `BUILTIN_AGENTS` and renders without crashing.
- [x] `cd featherkit-dashboard && bun run build` passes with no TypeScript errors.
- [x] `bun run build` passes.

## Risks
- `useAgentsQuery()` requires the dashboard to be running against a live `feather serve` backend. In `USE_MOCK` mode, it returns mock state that doesn't include real model configs. Guard: if `USE_MOCK` is true, keep using `BUILTIN_AGENTS`.
- The `AgentRoster` currently uses `BUILTIN_AGENTS` which has `model` as a short string like `'anthropic/claude-sonnet-4-6'`. The real config.models uses `{ provider, model }` separately. The display string should be `${data.provider}/${data.model}` or just `data.model` — match whatever the existing roster row renders.

## Constraints
- Do not touch `featherkit-dashboard/src/lib/api.ts` or `featherkit-dashboard/src/lib/queries.ts` — connect-a is actively modifying those. Read from `useAgentsQuery` which is already exported from queries.ts (agents-a added it).
- Do not remove `BUILTIN_AGENTS` from `builtin-agents.ts` — other parts of the app may use it.
- Keep the mocked `usageByRole` — no metrics source exists yet.

## Depends on
- `agents-a` ✓ (useAgentsQuery hook exists in queries.ts)
