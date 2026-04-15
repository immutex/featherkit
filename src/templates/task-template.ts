import type { FeatherConfig } from '../config/schema.js';

export function renderTaskTemplate(_config: FeatherConfig, taskId: string, title = ''): string {
  return `# Task: ${taskId}
${title ? `> ${title}\n` : ''}
## Goal
<!-- What needs to be done and why. One paragraph max. -->

## Status
pending

## Files
<!-- List files likely to be created or modified -->

## Constraints
<!-- Hard requirements: must not break X, must follow Y convention -->

## Risks
<!-- What could go wrong or needs careful attention -->

## Review Notes
<!-- Populated by critic role after review -->

## Next Action
<!-- What the next role should do first -->

## Done Criteria
- [ ] <!-- Specific, verifiable outcome -->
`;
}
