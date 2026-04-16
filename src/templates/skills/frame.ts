import type { FeatherConfig } from '../../config/schema.js';

export function renderFrameSkill(_config: FeatherConfig): string {
  return `---
name: frame
description: Plan a task — read context, produce a lean summary with done criteria and risks.
---

# /frame — Frame a Task

Plan before you build. A good frame takes 5 minutes and saves an hour.

## When to use

Use \`/frame\` at the start of any task that involves more than one file or more than ~30 minutes of work. Skip it for trivial one-liners.

## Step-by-step

### 1. Load context (read, don't guess)

Call these MCP tools in order:

\`\`\`
mcp__featherkit__get_project_brief
mcp__featherkit__get_active_focus
\`\`\`

Read what comes back. If there's an existing task file at \`project-docs/tasks/<id>.md\`, read that too.

### 2. Understand the request

Answer these before writing anything:
- What exactly needs to change?
- Which files are most likely touched?
- What does "done" look like — specifically?
- What could go wrong?

### 3. Write the task file

Create or update \`project-docs/tasks/<id>.md\`:

\`\`\`markdown
# Task: <id>

## Goal
<What needs to be done and why. Two sentences max.>

## Files
<List of files most likely to be created or modified. Be specific.>

## Done Criteria
- [ ] <Specific, verifiable outcome>
- [ ] <Another outcome>
- [ ] Tests pass (if applicable)

## Risks
<What could break, what needs careful attention, what assumptions you're making>

## Constraints
<Hard requirements: must not break X, must match Y pattern, must stay under Z size>
\`\`\`

### 4. Register the task

\`\`\`
mcp__featherkit__start_task  { taskId: "<id>", title: "<short title>" }
\`\`\`

### 5. Confirm

Print a one-paragraph summary of what will be built and why, then stop. Do not start implementing.

---

## Hard rules

**Do NOT:**
- Write implementation code during framing
- Enumerate every file in the repo
- Produce a full technical spec unless explicitly asked
- Restate the entire architecture
- Ask more than one clarifying question at a time

**Do:**
- Keep the task file under one page
- Make done criteria specific enough that anyone can verify them
- Note risks even if they seem unlikely
- Be honest about uncertainty ("unclear which files handle X")

---

## Token efficiency

Load only what you need:
- \`get_project_brief\` gives architecture context — don't also read all source files
- \`get_active_focus\` gives current priorities — trust it
- Read a source file only if you genuinely need to understand it to frame the task
`;
}
