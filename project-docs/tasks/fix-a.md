# Task: fix-a

## Goal
Wire the memory API route into `feather serve` and verify the Memory tab in the dashboard works end-to-end. All six `mem-*` tasks implemented a complete SQLite memory system, but `src/server/index.ts` never imports or dispatches `handleMemoryRoute` — so every `/api/memory/*` call returns 404.

## Context
`src/server/routes/memory.ts` exports `handleMemoryRoute` and implements three real endpoints backed by SQLite queries:
- `GET /api/memory/graph?scope=<scope>` → returns nodes + edges for the memory graph view
- `GET /api/memory/<id>` → memory detail with edges
- `GET /api/memory/trace/<taskId>` → retrieval trace for a task

The dashboard (`featherkit-dashboard/src/lib/queries.ts`) calls all three endpoints. The Memory tab currently renders "loading" forever or fails silently because all responses are 404. This is a critical gap — the Memory system was the largest investment in the MVP sprint and it's completely invisible in the dashboard.

## Files
- **`src/server/index.ts`** *(modify)* — add `import { handleMemoryRoute } from './routes/memory.js'` and dispatch it in the handler chain: `if (await handleMemoryRoute(req, res, pathname, context)) return;`
- **`src/server/routes/memory.ts`** *(verify/fix)* — confirm `handleMemoryRoute` signature matches the handler pattern `(req, res, pathname, context) => Promise<boolean>`. Fix if needed.
- **`featherkit-dashboard/src/views/Memory.tsx`** *(inspect only)* — verify the Memory tab renders graph/timeline/inspector correctly once the route is live. No changes expected.
- **`test/server/memory-route.test.ts`** *(new)* — unit test: mock a project with a populated SQLite DB, call `handleMemoryRoute` directly for each endpoint, assert 200 responses with valid JSON shapes.

## Done Criteria
- [ ] `GET /api/memory/graph?scope=repo` returns 200 with `{ nodes: [], edges: [], memoryCount: 0 }` on a fresh project (memory enabled, no entries yet).
- [ ] `GET /api/memory/graph?scope=repo` returns non-empty nodes/edges on a project with memory data.
- [ ] `GET /api/memory/<id>` returns 200 with `{ memory: {...}, edges: [...] }` for a known memory id.
- [ ] `GET /api/memory/trace/<taskId>` returns 200 with an array (empty if no trace).
- [ ] All three endpoints return 401 without a valid token (inherited from server auth middleware).
- [ ] `bun run build` passes. `bun test test/server/memory-route.test.ts` passes.
- [ ] Memory tab in the dashboard (opened via `feather serve`) shows the graph view without errors when memory is enabled.

## Risks
- `handleMemoryRoute` in memory.ts may open a new SQLite connection per request rather than reusing one — if so, it may need the `cwd` path to find `featherkit/memory.db`. Verify the route correctly resolves the DB path from `config` and `cwd`.
- If `config.memory.enabled` is false, the memory endpoints should return 404 (or a structured `{ enabled: false }` response). Confirm the route handles this case.
- The memory route opens `better-sqlite3` synchronously — this blocks the event loop per request. For MVP this is acceptable but note it in a comment.

## Constraints
- Do not change the existing route handler interface (`(req, res, pathname, context) => Promise<boolean>`).
- Memory routes must respect the same auth middleware as all other routes (already enforced by server/index.ts — do not add per-route auth).
- No new runtime dependencies.

## Depends on
- `mem-a` through `mem-e` ✓ (memory system complete)
- `dash-b` ✓ (server/index.ts exists)
