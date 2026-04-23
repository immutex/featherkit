# Task: mvp-polish

## Goal
Fix the 6 failing dashboard tests, fill in architecture.md with the real project overview, and bump the version to 1.0.0-alpha. This is the final gate before the MVP release.

## Files
- **`featherkit-dashboard/src/components/ui/Badge.tsx`** *(create if missing)* — the test `test/components.test.tsx` fails on `@/components/ui/Badge`. Check if it exists; create a minimal Badge component matching the project's UI pattern if not.
- **`featherkit-dashboard/src/data/mock.ts`** *(create if missing)* — the test `test/data.test.ts` fails on `@/data/mock`. Create or restore mock data exports that satisfy the test imports.
- **`featherkit-dashboard/test/components.test.tsx`** — investigate what exactly is being tested and what's needed; fix the import rather than deleting the test.
- **`featherkit-dashboard/test/data.test.ts`** — same.
- **`project-docs/context/architecture.md`** — fill in with real architecture: overview of the 4-stage loop (Frame→Build→Critic→Sync), key subsystems (orchestrator, memory, MCP server, CLI, dashboard), data flow (state.json, featherkit/config.json, .mcp.json), and conventions.
- **`package.json`** — bump `version` from `0.6.0` to `1.0.0-alpha`.
- **`featherkit-dashboard/package.json`** — bump dashboard version to `1.0.0-alpha` as well.

## Done Criteria
- [x] `bun test` in project root returns 0 failures (all 382+ tests pass).
- [x] `bun run build` passes with no type errors.
- [x] `bun run build` in `featherkit-dashboard/` passes with no TS errors.
- [x] `project-docs/context/architecture.md` is fully filled in (not the template placeholder).
- [x] `package.json` version is `1.0.0-alpha`.
- [x] Git commit created with message `chore: bump version to 1.0.0-alpha`.

## Risks
- The failing tests may point to missing source files that were accidentally omitted (Badge, mock). Check git log for when they were last present before assuming they need to be written from scratch.
- Architecture doc must reflect the real system, not aspirational design. Read the actual source files in `src/orchestrator/`, `src/memory/`, `src/mcp/` before writing.
- Do not change any test assertions — fix the source/module that's missing, not the test.

## Constraints
- Do not remove any passing tests.
- Badge component (if created) must match the visual style already used in the dashboard — check `src/components/ui/` for existing components to match the pattern.
- Architecture doc should be ~400–600 words, structured under the existing headings.

## Depends on
- All other MVP tasks can be in-flight; this task only touches tests + docs + version bump and runs independently.
