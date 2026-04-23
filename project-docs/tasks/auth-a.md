# Task: auth-a

## Goal
Surface provider authentication (OAuth + Claude CLI) in both the CLI (`feather auth`) and the dashboard Connections tab, so users can log in to non-Claude providers and verify their Claude Pro/Max setup before running the orchestrator.

## Context
The orchestrator's runner already routes non-Anthropic providers through `pi-loader.invokeProvider`, which uses Pi's `AuthStorage` (`~/.pi/auth.json`) for credentials. But there is currently no CLI or dashboard surface for:
- Checking which providers are authenticated
- Triggering login flows
- Verifying that `claude` binary is available and authenticated

This task fills that gap. Claude auth goes through the existing Claude CLI (`claude auth login` or detecting an existing session). Non-Claude provider auth goes through Pi's login flow (`pi login <provider>`).

## Files

**CLI:**
- **`src/commands/auth.ts`** *(new)* — `feather auth` command group:
  - `feather auth status` — list all configured providers with auth status (authenticated / unauthenticated / expired). Checks Claude CLI via `claude --version` (exit 0 = installed; check `~/.claude/` for session). Checks Pi providers via `pi-loader.listProviders()` + `AuthStorage` read.
  - `feather auth login <provider>` — for `claude`: print "Run `claude auth login` to authenticate." For Pi providers: shell out to `pi login <provider>` with `stdio: 'inherit'`.
  - `feather auth logout <provider>` — for Pi providers: remove entry from `~/.pi/auth.json`. For Claude: print "Run `claude auth logout`."
- **`src/commands/doctor.ts`** — add two new checks to `runDoctor`:
  1. `claude` binary on PATH — `which claude` or `execa('claude', ['--version'], { reject: false })`. Fail with "Install Claude Code CLI."
  2. `pi` binary on PATH — `which pi` or `execa('pi', ['--version'], { reject: false })`. Warn (not fail) — Pi is needed only for non-Claude providers.
- **`src/cli.ts`** — register `authCommand`.

**Dashboard (Connections tab):**
- **`src/server/routes/connections.ts`** *(part of dash-b/dash-e)* — add real implementation:
  - `GET /api/connections/providers` — calls `pi-loader.listProviders()` to get Pi-managed providers; prepends a hardcoded Claude entry with status derived from `claude` binary check.
  - `POST /api/connections/providers/:provider/login` — for Claude: returns `{ type: 'cli', instruction: 'Run: claude auth login' }`. For Pi providers: calls `execa('pi', ['login', provider])` in a detached subprocess (non-blocking), returns `{ type: 'pending' }`.
  - `GET /api/connections/providers/:provider/status` — re-checks auth status. For Claude: check `~/.claude/` session files. For Pi: read `~/.pi/auth.json`.
- **`featherkit-dashboard/src/views/Connections.tsx`** — wire provider cards to real API:
  - `useQuery(['connections/providers'])` → provider list with status badges.
  - Login button for Claude shows an inline instruction ("Run in your terminal: `claude auth login`") instead of opening a browser tab.
  - Login button for Pi providers calls `POST /api/connections/providers/:provider/login`, then polls status every 2s until connected or 60s timeout.
  - Provider status badge: green = connected, amber = unauthenticated, red = error.

## Done Criteria
- [x] `feather auth status` outputs a table with at least "claude" row showing connected/disconnected.
- [x] `feather auth login anthropic` prints the Claude CLI instruction (does not hang).
- [x] `feather auth login openai` (if Pi OpenAI package is installed) shells out to `pi login openai` interactively.
- [x] `feather doctor` now fails if `claude` binary is not on PATH, with actionable message.
- [x] `feather doctor` warns (does not fail) if `pi` binary is not on PATH.
- [x] `GET /api/connections/providers` returns Claude entry with correct status.
- [x] Dashboard Connections tab shows provider cards with real status badges (no mock data).
- [x] Polling for a Pi provider login eventually resolves to `connected` after successful `pi login`.
- [x] `bun run build` passes. `bun test` passes.

## Risks
- `pi login <provider>` spawns an interactive process. Spawning it from an HTTP route (`POST /login`) won't work if it expects a TTY. Solution: return the `pi login <provider>` command as a string for the user to run in their terminal, same as the Claude flow. Only auto-spawn for providers that have non-interactive OAuth (browser-redirect flows). Investigate during build.
- `~/.claude/` session file layout may change across Claude Code versions. Use `claude --version` as a proxy for "installed and works"; treat any session JSON as "authenticated" without parsing internals.
- Pi's `AuthStorage` format is internal to `@mariozechner/pi-coding-agent` — read it via the SDK (`AuthStorage.create(...).get(provider)`) rather than parsing the JSON directly.

## Constraints
- Claude auth is NEVER routed through Pi or OAuth. It always goes through the Claude CLI (`claude auth login`). This is a hard constraint for TOS compliance.
- `POST /api/connections/providers/:provider/login` must respond within 500ms regardless of what the Pi subprocess does — return immediately with a `{ type: 'pending' | 'cli' }` response.
- Do not add new npm deps. `execa` + `@mariozechner/pi-coding-agent` are already installed.

## Depends on
- `pi-a` ✓ (pi-loader.ts exists with AuthStorage integration)
- `dash-b` (server routes)
