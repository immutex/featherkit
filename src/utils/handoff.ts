// Shared handoff markdown builder — used by both CLI and MCP tool.
// No console.log (safe to import from MCP server).

export interface HandoffMdOptions {
  from: string;
  to: string;
  timestamp: string;
  taskId?: string;
  notes: string;
}

export function buildHandoffMd({ from, to, timestamp, taskId, notes }: HandoffMdOptions): string {
  const taskLine = taskId ? `**Task:** ${taskId}\n` : '';
  return `# Latest Handoff

**From:** ${from}
**To:** ${to}
**Time:** ${timestamp}
${taskLine}
## Notes

${notes.trim()}
`;
}
