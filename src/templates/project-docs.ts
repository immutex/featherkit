import type { FeatherConfig } from '../config/schema.js';

export interface TemplateFile {
  relativePath: string;
  content: string;
}

export function renderProjectDocs(config: FeatherConfig): TemplateFile[] {
  return [
    {
      relativePath: `${config.docsDir}/context/architecture.md`,
      content: `# Architecture

> Fill in: high-level overview of the project structure and key design decisions.

## Overview

## Key Components

## Data Flow

## Conventions
`,
    },
    {
      relativePath: `${config.docsDir}/context/conventions.md`,
      content: `# Conventions

> Fill in: coding standards, patterns, and rules for this project.

## Code Style

## Testing

## Git

## Naming
`,
    },
    {
      relativePath: `${config.docsDir}/active/current-focus.md`,
      content: `# Current Focus

**Project:** ${config.projectName}
**Updated:** ${new Date().toISOString().split('T')[0]}

## Active Task
None

## Next Up
None

## Blocked
None
`,
    },
    {
      relativePath: `${config.docsDir}/active/latest-handoff.md`,
      content: `# Latest Handoff

No handoffs yet. Use \`featheragents handoff write\` or the \`/sync\` skill.
`,
    },
    {
      relativePath: `${config.docsDir}/tasks/.gitkeep`,
      content: '',
    },
  ];
}
