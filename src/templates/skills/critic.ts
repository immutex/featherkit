import type { FeatherConfig } from '../../config/schema.js';

export function renderCriticSkill(_config: FeatherConfig): string {
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
mcp__featheragents__get_task  { taskId: "<id>" }
\`\`\`

Read the goal, done criteria, progress log, and any existing review notes. This is your review scope — stay within it.

### 2. Read the diff

Review the code changes relevant to this task. Use git diff or read the changed files directly. Focus on what changed, not the entire codebase.

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
mcp__featheragents__record_review_notes  {
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
- Read only the files that changed for this task
- One entry in record_review_notes is enough — don't call it repeatedly
- If a criterion is clearly met, note it and move on
`;
}
