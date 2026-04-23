# Task: ci-a

## Goal
Set up GitHub Actions CI (test + build on every push/PR) and a publish workflow (npm publish on version tags), and fix the `feather` binary alias so the CLI matches the documentation everywhere.

## Context
The package is at `1.0.0-alpha` and publish-ready structurally (`files: ['dist', 'README.md', 'LICENSE']`, `prepublishOnly: bun run build`). Two gaps block shipping:
1. No CI — nothing enforces that PRs don't break tests or the build.
2. The `bin` field only exposes `featherkit` and `featherkit-mcp`, but every doc and README says `feather`. The `feather` alias is missing.

## Files

- **`.github/workflows/ci.yml`** *(new)* — triggered on `push` and `pull_request` to `main`. Jobs: `test` (Bun install → `bun test`) and `build` (Bun install → `bun run build` + `cd featherkit-dashboard && bun run build`). Use `oven-sh/setup-bun@v2` action.
- **`.github/workflows/publish.yml`** *(new)* — triggered on `push` to tags matching `v*`. Steps: checkout → setup Bun → `bun run build` → `npm publish --access public`. Requires `NPM_TOKEN` secret. Runs only if CI passes (use `needs: ci` or a separate protected workflow).
- **`package.json`** — add `"feather": "./dist/cli.js"` to `bin` alongside `featherkit`. Keep `featherkit` as a fallback alias — no breaking change.
- **`src/cli.ts`** — change `program.name('featherkit')` to `program.name('feather')` so `--help` output and error messages show `feather`, matching the docs.
- **`CHANGELOG.md`** *(new)* — 1.0.0-alpha release notes: what's new (orchestrator, dashboard, memory system, Pi multi-model routing), what's not yet stable (ipc-a, auth-a event relay), and upgrade notes (breaking: complete rewrite from 0.6.x).

## Done Criteria
- [x] `feather --help` and `featherkit --help` both work after a global install from the built dist.
- [x] `program.name('feather')` is set in `src/cli.ts` — `feather --help` shows `feather` not `featherkit`.
- [x] `bun run build` passes. `bun test` passes.
- [x] `.github/workflows/ci.yml` exists and is valid YAML (validate with `npx js-yaml` or equivalent).
- [x] `.github/workflows/publish.yml` exists, triggers on `v*` tags, uses `NPM_TOKEN` secret.
- [x] `CHANGELOG.md` exists with a `## 1.0.0-alpha` section.
- [x] `package.json` `bin` has both `feather` and `featherkit` pointing to `./dist/cli.js`.

## Risks
- GitHub Actions `oven-sh/setup-bun` must pin a version (`@v2` not `@latest`) to avoid surprise breakage.
- The `bun test` step in CI may fail on the `memory extraction timed out` flaky test (seen locally under load). Add `--timeout 30000` or a retry count, or skip that single test in CI via `--exclude`.
- `npm publish` from GitHub Actions requires the `NPM_TOKEN` secret to be set in the repo settings. Document this in the CI workflow as a comment — don't assume it exists.
- Dashboard build step requires `bun install` inside `featherkit-dashboard/` separately. Don't forget the `working-directory` key.

## Constraints
- Keep `featherkit` bin alias — removing it is a breaking change for anyone who installed 0.6.x.
- CI must run on `ubuntu-latest`. Do not add macOS or Windows runners yet — cost overhead.
- `publish.yml` must not run on every push, only on `v*` tags. Use `if: startsWith(github.ref, 'refs/tags/v')` or the `on.push.tags` filter.
- No secrets committed to the repo. `NPM_TOKEN` lives in GitHub repo secrets only.
