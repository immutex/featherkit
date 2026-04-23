import type { ApiModelConfig } from './queries.js';

export type BuiltInRole = 'frame' | 'build' | 'critic' | 'sync';

export type BuiltInAgent = {
  id: string;
  name: string;
  builtIn: true;
  roleColor: BuiltInRole;
  systemPrompt: string;
  model: string;
  skills: string[];
  mcpServers: string[];
};

export const BUILTIN_AGENTS: BuiltInAgent[] = [
  {
    id: 'agent-frame',
    name: 'Frame',
    builtIn: true,
    roleColor: 'frame',
    systemPrompt:
      'You are the Frame agent. Read the full project context, analyze requirements, and produce a detailed implementation plan with clear done criteria. Break work into small, verifiable steps.',
    model: 'anthropic/claude-sonnet-4-6',
    skills: ['deep-plan'],
    mcpServers: ['filesystem', 'github'],
  },
  {
    id: 'agent-build',
    name: 'Build',
    builtIn: true,
    roleColor: 'build',
    systemPrompt:
      'You are the Build agent. Implement the task according to the plan from the Frame phase. Make small, focused commits. Write tests alongside code. Follow project conventions strictly.',
    model: 'openai/gpt-5.4',
    skills: ['incremental-code'],
    mcpServers: ['filesystem', 'github'],
  },
  {
    id: 'agent-critic',
    name: 'Critic',
    builtIn: true,
    roleColor: 'critic',
    systemPrompt:
      'You are the Critic agent. Review the diff produced by the Build phase against the original task goal and done criteria. Identify issues, missing tests, style violations, or incomplete work. Write structured findings.',
    model: 'openrouter/z-ai/glm-5.1',
    skills: ['diff-review'],
    mcpServers: ['filesystem'],
  },
  {
    id: 'agent-sync',
    name: 'Sync',
    builtIn: true,
    roleColor: 'sync',
    systemPrompt:
      'You are the Sync agent. Write handoff notes summarizing what was done, what changed, and any remaining concerns. Update state.json and prepare context for the next cycle.',
    model: 'openai/gpt-5.4-mini',
    skills: ['handoff-notes'],
    mcpServers: ['filesystem'],
  },
];

const BUILTIN_AGENT_BY_ID = new Map(BUILTIN_AGENTS.map((agent) => [agent.id, agent]));
const BUILTIN_AGENT_BY_ROLE = new Map(BUILTIN_AGENTS.map((agent) => [agent.roleColor, agent]));

export function getBuiltInAgentById(agentId: string | null | undefined): BuiltInAgent | null {
  if (!agentId) {
    return null;
  }

  return BUILTIN_AGENT_BY_ID.get(agentId) ?? null;
}

export function getBuiltInAgentByRole(role: string | null | undefined): BuiltInAgent | null {
  if (!role) {
    return null;
  }

  return BUILTIN_AGENT_BY_ROLE.get(role as BuiltInRole) ?? null;
}

export function getModelForRole(models: ApiModelConfig[], role: string): string {
  const configuredModel = models.find((candidate) => candidate.role === role);
  if (configuredModel) {
    return `${configuredModel.provider}/${configuredModel.model}`;
  }

  return getBuiltInAgentByRole(role)?.model ?? '';
}
