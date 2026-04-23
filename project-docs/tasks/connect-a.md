# Task: connect-a

## Goal
Fix the dashboard auth token flow so users don't have to manually copy the token into `.env.local`. `feather serve` should emit a URL that carries the token, and `api.ts` should accept it from URL params or `sessionStorage` when `VITE_API_TOKEN` is not set at build time.

## Context
`getApiToken()` in `featherkit-dashboard/src/lib/api.ts` reads exclusively from `import.meta.env.VITE_API_TOKEN`, which Vite inlines at build time. The token is generated at runtime by `feather serve` and written to `.project-state/dashboard.token`. There is no automatic way for the browser to receive it — the user has to manually copy it into `.env.local` before starting `bun run dev`. The current error message ("Copy .project-state/dashboard.token into featherkit-dashboard/.env.local") is confusing and the workflow is broken for anyone who follows the README literally.

## Files
- **`featherkit-dashboard/src/lib/api.ts`** *(modify `getApiToken`)* — change the token resolution order:
  1. `import.meta.env.VITE_API_TOKEN` (existing, build-time — dev override)
  2. `window.__FEATHERKIT_TOKEN__` (runtime injection — for `serve-b` static serving)
  3. `sessionStorage.getItem('fk-token')` — persisted from a URL param on first load
  4. `new URLSearchParams(window.location.search).get('token')` — one-time URL param
  If found via URL param, store in `sessionStorage` immediately and strip the param from the URL (use `history.replaceState`) so it isn't shared/bookmarked. Throw only if all four are empty.
- **`featherkit-dashboard/src/lib/ws.ts`** — no change needed; it already calls `getApiToken()` which will work once the above is fixed.
- **`src/commands/serve.ts`** *(modify output)* — change the printed URL from `http://localhost:7721` to `http://localhost:7721?token=<token>` so the user can open it directly. Keep the plain URL in the `server.url` field on the returned object (so e2e tests don't break — they use `server.url`, not the stdout line).
- **`featherkit-dashboard/.env.example`** *(update comment)* — add a note that `VITE_API_TOKEN` is only needed for dev mode when not using the `?token=<token>` URL from `feather serve`.

## Done Criteria
- [x] Opening `http://localhost:5173?token=<valid-token>` (Vite dev server) in a browser authenticates without setting `VITE_API_TOKEN`.
- [x] After opening with `?token=`, the URL is cleaned (no token in browser address bar) and the page still works on refresh (token in sessionStorage).
- [x] Opening `http://localhost:5173?token=bad-token` causes 401 API errors, not a crash.
- [x] `getApiToken()` still works when `VITE_API_TOKEN` is set (existing dev flow unchanged).
- [x] `feather serve` stdout includes the token in the URL: `Dashboard: http://localhost:7721?token=<token>`.
- [x] `bun run build` passes. `cd featherkit-dashboard && bun run build` passes.

## Risks
- `history.replaceState` is not available in all environments (SSR, jsdom tests). Guard with `typeof history !== 'undefined'`.
- If the SPA is server-rendered or pre-rendered, `window.location.search` may not be available. For this project, it's a pure CSR SPA so this is not a concern.
- `sessionStorage` is per-tab — if the user opens multiple tabs they each need to carry the token in the URL (or all tabs from the same origin share sessionStorage automatically). `sessionStorage` is per-tab per-origin, so opening a new tab without the URL param will lose the token. Consider `localStorage` instead with a clear note that it persists across sessions.

## Constraints
- Do not remove the `VITE_API_TOKEN` path — it remains the first priority so dev `.env.local` flows still work.
- Token must never appear in `console.log` output.
- This task does NOT implement static file serving — that's `serve-b`. This only fixes the token flow for the dev-mode Vite server.

## Depends on
- `dash-b` ✓ (server auth exists)
- `dash-c` ✓ (api.ts exists)
