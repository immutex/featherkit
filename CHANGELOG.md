# Changelog

## 1.0.0-alpha

### What's new

- Full local-first FeatherKit rewrite with the Frame → Build → Critic → Sync orchestrator loop.
- Live dashboard experience for tasks, workflow state, connections, and project visibility.
- SQLite-backed memory system with retrieval and write pipelines for long-term context.
- Pi-powered multi-model routing alongside Claude Code execution support.
- Release packaging cleanup for the `feather` CLI alias and GitHub Actions automation.

### Not yet stable

- `ipc-a` is still in flight, so cross-process event relay behavior may continue to change before a stable release.
- `auth-a` is still in flight, so provider authentication and related dashboard connection flows are not yet considered stable.

### Upgrade notes

- **Breaking:** this is a full rewrite from the 0.6.x line rather than an incremental update.
- Existing users should treat 1.0.0-alpha as a fresh install and re-run project initialization where needed.
- Both `feather` and `featherkit` now point to the same CLI binary so existing installs keep working while the docs standardize on `feather`.
