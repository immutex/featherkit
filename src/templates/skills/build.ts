import type { FeatherConfig } from '../../config/schema.js';

export function renderBuildSkill(_config: FeatherConfig): string {
  return `---
name: build
description: Implement a task — read the task file, write code, commit small, log progress.
---

# /build — Implement a Task

Read first. Build second. Log as you go.

## When to use

Use \`/build\` when a task has been framed and is ready for implementation. The task file at \`project-docs/tasks/<id>.md\` should exist and have done criteria.

## Step-by-step

### 1. Load the task

\`\`\`
mcp__featheragents__get_task  { taskId: "<id>" }
\`\`\`

Read the goal, files list, done criteria, and risks. If there are open questions, resolve them before writing code — don't guess.

### 2. Read only what you need

Read the specific files listed in the task. If you need conventions, check \`project-docs/context/conventions.md\`. Do not read the entire codebase.

### 3. Implement

- Follow existing code patterns. Match the style of surrounding code.
- Write tests alongside code for any non-trivial logic.
- Make small, focused commits — one logical change per commit.
- If you hit an unexpected blocker, stop and surface it rather than working around it silently.

### 4. Log progress at each significant step

After completing a meaningful chunk (a module, a test suite, a tricky function):

\`\`\`
mcp__featheragents__append_progress  {
  taskId: "<id>",
  role: "build",
  message: "<one sentence: what was done>"
}
\`\`\`

Keep messages factual and brief: "Implemented state-io atomicWrite", not "Made great progress on the file writing system".

### 5. Verify done criteria

Before declaring done, check each criterion in the task file explicitly. Run tests. If something is unmet, finish it or note it as a blocker.

---

## Hard rules

**Do NOT:**
- Restate the plan at every step
- Read files unrelated to the task
- Refactor code outside the task scope ("while I'm here...")
- Skip tests for logic that can fail in non-obvious ways
- Make a large "everything" commit at the end

**Do:**
- Match the existing code style exactly
- Ask before changing scope
- Commit frequently
- Surface blockers early

---

## Token efficiency

- \`get_task\` gives you everything you need — don't also load the entire project brief
- For a single-call context bundle: \`prepare_context_pack { forRole: "build", taskId: "<id>" }\` replaces \`get_task\` + conventions reading with one call
- Read source files surgically: the specific files named in the task, plus direct imports
- \`append_progress\` keeps notes compact — one sentence per entry
- Don't summarize what you're about to do; just do it
`;
}
