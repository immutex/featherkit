import type { FeatherConfig } from '../../config/schema.js';
import { integrationSteps } from '../integration-steps.js';

export function renderCriticSkill(config: FeatherConfig): string {
  const steps = integrationSteps(config, 'critic');
  return `---
name: critic
description: Review code changes against the task goal — find bugs, gaps, and missing tests.
---

# /critic — Review Changes

Read the task goal. Read the diff. Find the gaps.

## When to use

Use \`/critic\` after implementation is complete, before syncing state or merging. You are reviewing whether the code meets the task's done criteria — not doing a general code quality audit.

## Step-by-step

### 1. Load the task

\`\`\`
mcp__featherkit__get_task  { taskId: "<id>" }
\`\`\`

Read the goal, done criteria, progress log, and any existing review notes. This is your review scope — stay within it.

> **Verification check:** The build agent should have called \`verify_phase { phase: "build" }\` before handing off. If the handoff notes don't mention verification results, note this — it means TypeScript, tests, and scope haven't been mechanically confirmed. You may want to flag it as a process gap in your review notes.

### 2. Get the diff

\`\`\`
mcp__featherkit__get_diff  { taskId: "<id>" }
\`\`\`

This returns a git diff scoped to the files listed in the task. Read only what changed — not the entire codebase.

### 3. Check each done criterion

Go through done criteria one by one:
- Is this criterion met? (yes / no / partially)
- If no or partially: what specifically is missing?

### 4. Check for common failure modes

For each changed area, ask:
- **Correctness** — does this logic handle the normal case? The empty case? The error case?
- **Tests** — is there test coverage for non-trivial logic? Do the tests actually verify the behavior?
- **Regressions** — could this change break something that worked before?
- **Conventions** — does this match the patterns in the rest of the codebase?
- **Edge cases** — what inputs or states weren't considered?

### 5. Write review notes

\`\`\`
mcp__featherkit__record_review_notes  {
  taskId: "<id>",
  notes: "<your findings>"
}
\`\`\`

Format your notes as:

\`\`\`
## Blockers (must fix before merge)
- <file>:<line or function> — <specific issue> — <suggested fix>

## Suggestions (optional)
- <file> — <observation>

## Approved criteria
- [x] <criterion that is met>
- [ ] <criterion that is not met>
\`\`\`

---

## Hard rules

**Do NOT:**
- Nitpick formatting or style unless it causes real problems
- Review files unrelated to this task
- Approve if any done criterion is unmet
- Write vague feedback ("this could be better") — be specific
- Restate what the code does — say what's wrong with it

**Do:**
- Separate blockers from suggestions clearly
- Cite file and function when identifying an issue
- Acknowledge what is done well (keeps the review useful)
- Approve explicitly when all criteria are met

---

## Token efficiency

- \`get_task\` scopes your review — don't load unrelated context
- \`get_diff\` scopes the diff to task files — no need to read full file contents unless a specific line needs more context
- For a single-call context bundle: \`prepare_context_pack { forRole: "critic", taskId: "<id>" }\` replaces \`get_task\` + \`get_diff\` with one call
- One entry in \`record_review_notes\` is enough — don't call it repeatedly
- If a criterion is clearly met, note it and move on
${steps}`;
}
