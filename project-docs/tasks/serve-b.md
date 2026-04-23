# Task: serve-b

## Goal
Make `feather serve` serve the built dashboard SPA from the same port as the API, so users get a working dashboard by opening a single URL — no separate Vite process required.

## Context
The README documents `feather serve` as "Open http://localhost:7721 to get the dashboard." But `src/server/index.ts` returns 404 for all non-`/api/` requests. Users who follow the README see a blank "Not Found" response. The architecture.md also says "serves static dashboard files" which is untrue today. The dashboard requires a separate `bun run dev` process, manual token copying, and opening a different port. Closing this gap makes the product actually usable by non-developer users and fulfills the README promise.

## Files
- **`src/server/static.ts`** *(new)* — `serveStaticFile(res, filePath): Promise<boolean>`. Reads the file, sets content-type from extension (`.js→application/javascript`, `.css→text/css`, `.html→text/html`, `.svg→image/svg+xml`, `.ico→image/x-icon`, `.*→application/octet-stream`), sets `Cache-Control: no-cache` for HTML and `Cache-Control: max-age=31536000, immutable` for hashed assets. Returns `true` if served, `false` if not found.
- **`src/server/index.ts`** *(modify)* —
  - Add a `GET /app-config.js` route (before auth check) that returns `window.__FEATHERKIT_TOKEN__="${token}";` with `Content-Type: application/javascript`. This is intentionally unauthenticated — it's a public endpoint on `127.0.0.1` only and the token it returns is already in the URL.
  - Add static file serving for non-`/api/` GET requests: resolve the path relative to the bundled dashboard dist dir (`join(dashboardDistDir, pathname === '/' ? 'index.html' : pathname)`), call `serveStaticFile(res, filePath)`. If the file doesn't exist, fall through to `index.html` (SPA fallback).
  - Export `DASHBOARD_DIST_DIR` constant pointing to `../featherkit-dashboard/dist` relative to the CLI dist.
- **`featherkit-dashboard/index.html`** *(modify)* — add `<script src="/app-config.js"></script>` before the main Vite entry `<script type="module" ...>`. This loads the runtime token before the React app initializes.
- **`featherkit-dashboard/src/lib/api.ts`** *(modify, after connect-a)* — add `window.__FEATHERKIT_TOKEN__` as the second token source (after `VITE_API_TOKEN`, before `sessionStorage`). Declare the global: `declare global { interface Window { __FEATHERKIT_TOKEN__?: string } }`.
- **`package.json`** *(modify)* — add `featherkit-dashboard/dist` to the `files` array so it is included in the npm package.
- **`.gitignore`** *(check)* — ensure `featherkit-dashboard/dist` is gitignored (it should already be via `dist/`).
- **`package.json` scripts** *(modify)* — update `prepublishOnly` to run both `bun run build` and `cd featherkit-dashboard && bun run build` so the dashboard dist is always fresh before publish.

## Done Criteria
- [x] After `bun run build && cd featherkit-dashboard && bun run build`, running `feather serve` and opening `http://localhost:7721?token=<token>` in a browser shows the full dashboard UI — no separate Vite server needed.
- [x] `GET /app-config.js` returns valid JS that sets `window.__FEATHERKIT_TOKEN__` (no auth required).
- [x] `GET /` returns the dashboard `index.html` (200, not 404).
- [x] `GET /assets/<hashed-file>.js` returns the JS bundle with correct Content-Type and immutable cache headers.
- [x] `GET /api/state` still requires auth and returns 401 without a token (API routes unaffected).
- [x] SPA routes (e.g. navigating to a sub-view and refreshing) return `index.html` via the fallback (no 404).
- [x] `bun run build` passes. E2e tests still pass (`bun test test/e2e/`).

## Risks
- The dashboard dist path must be resolved relative to the built `dist/cli.js` — use `import.meta.url` or `__dirname` with the tsup output structure. Verify the relative path after building.
- `serveStaticFile` must NOT serve files outside the dashboard dist directory — sanitize the path and reject anything with `..` or outside the dist root.
- If `featherkit-dashboard/dist/` doesn't exist (e.g. after `bun run build` alone without the dashboard build), the server should fall through to 404 with a helpful message rather than crashing.
- The `prepublishOnly` script change adds dashboard build time to publish. This is acceptable — the dashboard build takes ~5s.
- The `/app-config.js` endpoint is unauthenticated by design. The token it exposes is already in the URL bar. It must only run on `127.0.0.1` (already enforced by `server.listen(port, '127.0.0.1', ...)`).

## Constraints
- No new npm dependencies for static serving — use `node:fs/promises` `readFile` + `node:path`.
- Path traversal protection is mandatory: reject any request where `normalize(pathname)` doesn't start with the dist root.
- Do not remove the existing `/api/` routing — static serving only applies to non-API paths.
- This task depends on `connect-a` for the `window.__FEATHERKIT_TOKEN__` wiring in `api.ts`.

## Depends on
- `connect-a` (window.__FEATHERKIT_TOKEN__ wiring in api.ts)
- `dash-b` ✓ (server/index.ts)
- `dash-c` ✓ (dashboard built and working)
