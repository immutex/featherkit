import type { FeatherConfig } from '../../config/schema.js';

export function renderSyncSkill(_config: FeatherConfig): string {
  return `---
name: sync
description: Write a self-contained handoff so the next role can resume without losing context.
---

# /sync — Sync State and Hand Off

Close out the session. Write a handoff that makes the next role productive from the first message.

## When to use

Use \`/sync\` at the end of any work session — after a build phase, after a critic review, or when switching between roles or models. Also use it when you need to park a task and pick it up later.

## Step-by-step

### 1. Load current state

\`\`\`
mcp__featherkit__get_task        { taskId: "<id>" }
mcp__featherkit__get_active_focus
\`\`\`

Review what was accomplished this session and what remains.

### 2. Assess completeness

- Which done criteria are met?
- What is the next concrete action?
- Are there blockers, open questions, or decisions that were deferred?

### 3. Write the handoff

\`\`\`
mcp__featherkit__write_handoff  {
  from: "<your role>",
  to: "<next role>",
  taskId: "<id>",
  notes: "<handoff content>"
}
\`\`\`

Your handoff notes should be self-contained. Use this structure:

\`\`\`markdown
## What was done
<Bullet list of completed work. Be specific: "Implemented atomicWrite in src/utils/fs.ts", not "worked on file writing".>

## What is next
<The single most important next action. Then list remaining items in order.>

## Blockers / open questions
<Anything that must be resolved before work can continue. If none, say "None".>

## Key decisions made
<Any non-obvious choices made during this session and why. Omit if nothing notable.>

## Files changed
<List of files that were modified. Helps the next role orient quickly.>
\`\`\`

### 4. Confirm

Print "Handoff written: <from> → <to>" and stop.

---

## Hard rules

**Do NOT:**
- Write more than ~300 words in the handoff notes
- Assume the next role has read this session's conversation
- Omit blockers to make things look cleaner than they are
- Write vague next actions ("continue implementation")
- Use the sync skill to avoid completing work — sync is for session boundaries

**Do:**
- Make the "What is next" section specific enough to act on immediately
- Include file paths where relevant
- Mention the current branch or PR if applicable
- Note any environment setup the next role will need

---

## Token efficiency

- \`get_task\` and \`get_active_focus\` together give full context — don't read source files during sync
- One \`write_handoff\` call is all you need — it updates both state and latest-handoff.md
- Keep handoff notes compact — the next role will read the source files themselves
`;
}
