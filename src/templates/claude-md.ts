import type { FeatherConfig } from '../config/schema.js';
import { integrationHint } from './integration-steps.js';

export function renderClaudeMd(config: FeatherConfig): string {
  const integrationLines = Object.entries(config.integrations)
    .filter(([, enabled]) => enabled)
    .map(([name]) => `- ${integrationHint(name)}`)
    .join('\n');

  const modelLines = config.models
    .map((m) => `- **${m.role}**: ${m.provider}/${m.model}`)
    .join('\n');

  return `# ${config.projectName}

## FeatherKit Workflow

This project uses FeatherKit for multi-model coordination.
4-stage loop: **Frame → Build → Critique → Sync**

### Roles & Models
${modelLines}

### MCP Tools Available
Use \`mcp__featherkit__*\` tools for project state:
- \`get_project_brief\` — project summary and active focus
- \`get_active_focus\` — current focus file
- \`get_task\` — task details and progress
- \`start_task\` — register/activate a task
- \`append_progress\` — log progress to current task
- \`record_review_notes\` — write review findings
- \`write_handoff\` — write handoff between roles
- \`record_decision\` — record an architectural decision
- \`list_tasks\` — all tasks and statuses
- \`get_diff\` — scoped git diff for the current task's files (use in critic sessions)
- \`prepare_context_pack\` — single-call context bundle for a specific role (frame/build/critic/sync)
- \`verify_phase\` — deterministic gate: scope check, tsc, tests — call before write_handoff

### Skills
- \`/frame\` — plan a task (read context, produce summary + done criteria)
- \`/build\` — implement a task (follow task file, commit small)
- \`/critic\` — review changes (diff + task goal only)
- \`/sync\` — handoff notes and state sync
${integrationLines ? `\n### Integrations\n${integrationLines}` : ''}
### Conventions
- Read task file before acting: \`${config.docsDir}/tasks/<id>.md\`
- Project state: \`${config.stateDir}/state.json\` (via MCP — don't edit directly)
- Keep context tight. Only read files relevant to the current task.
`;
}
