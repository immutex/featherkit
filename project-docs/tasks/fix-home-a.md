# Task: fix-home-a

## Goal
Fix four bugs in the Home/Projects view reported from alpha testing: NaN% progress, unwired "Run orchestrator" button, chat messages that send to nowhere, and a History tab showing hardcoded mock data.

## Context
`featherkit-dashboard/src/views/Projects.tsx` has these issues:
1. **NaN% progress** — `Math.round((done / project.tasks.length) * 100)` produces `NaN` when `tasks.length === 0`. One-line fix: guard with `project.tasks.length === 0 ? 0 : Math.round(...)`.
2. **Run orchestrator button** — Line ~65 has `<Button variant="accent" size="sm"><Play size={14} />Run orchestrator</Button>` with no `onClick`. Should call `POST /api/tasks/:id/run` (endpoint exists in `src/server/routes/tasks.ts`). Wire with a `useMutation` that POSTs to that endpoint for the current project's active task ID.
3. **Chat sends to nowhere** — `handleSend()` in the Chat component only does `setMessages(m => [...m, userMsg])` — no API call, no WebSocket send, no AI response. The WS connection is read-only (orchestrator events → client). For now: add a `POST /api/chat` endpoint that accepts `{ projectId, message }` and appends it as a `user-input` event to `events.jsonl` so the orchestrator can see it; the response back is an acknowledgement. If no orchestrator is running, return a clear error: `{ error: "No orchestrator running for this project" }`. Add a typing indicator in the UI that resolves after receiving a `chat-response` WS event (or times out after 30s).
4. **History tab hardcoded** — `HistoryTimeline()` has 5 hardcoded items. Wire to real data: use `useEventsQuery()` (or add one) that fetches recent events from `GET /api/events?limit=50` — implement this simple endpoint that reads the last N lines of `events.jsonl` and returns them as JSON.

## Files
- **`featherkit-dashboard/src/views/Projects.tsx`** — NaN fix (line 241), orchestrator button onClick, chat handleSend API call, History real data
- **`src/server/routes/tasks.ts`** — verify `POST /api/tasks/:id/run` exists and returns useful response
- **`src/server/index.ts`** — add `POST /api/chat` route dispatch and `GET /api/events` route dispatch
- **`src/server/routes/chat.ts`** *(new)* — handle `POST /api/chat`: validate auth, append `user-input` event to events.jsonl
- **`src/server/routes/events.ts`** *(new)* — handle `GET /api/events?limit=N`: read last N lines of events.jsonl, return as JSON array
- **`featherkit-dashboard/src/lib/queries.ts`** — add `useEventsQuery()` and `useRunTaskMutation()` if not already present

## Done Criteria
- [x] Overview tab shows `0%` (not `NaN%`) when a project has zero tasks
- [x] "Run orchestrator" button calls `POST /api/tasks/:active-task-id/run` and shows a toast/state change on success
- [x] Sending a chat message calls `POST /api/chat` and shows a "waiting for response" indicator; if orchestrator isn't running, shows the error message inline
- [x] History tab renders real events from `GET /api/events` instead of hardcoded items (falls back to "No events yet" when events.jsonl is empty)
- [x] `bun run build` passes, `cd featherkit-dashboard && bun run build` passes

## Risks
- The "line that looks weird on the left of the blue buttons" — this is likely a left border/accent line CSS artifact in Projects.tsx or a global style. Inspect the button row markup and remove any `border-l` or `before:` pseudo-element that creates an orphaned line.
- Chat is inherently async — the orchestrator may not respond immediately. The UI must not block or hang. Use a polling approach or WS event listener with a timeout.
- `GET /api/events` must be auth-gated (same bearer token as other routes) and must NOT traverse outside `.project-state/`

## Constraints
- Do not implement full bidirectional AI chat (LLM response generation) — just the relay + ack pattern described above
- The mock activity breakdown (frame 18%, build 52%, etc.) in the stats grid can stay hardcoded for now — that's a metrics feature, not a bug
