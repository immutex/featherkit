import { z } from 'zod/v4';

export const ModelRoleSchema = z.enum(['frame', 'build', 'critic', 'sync']);
export type ModelRole = z.infer<typeof ModelRoleSchema>;

export const ModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  role: ModelRoleSchema,
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const ClientsSchema = z.enum(['claude-code', 'opencode', 'both']);
export type Clients = z.infer<typeof ClientsSchema>;

export const IntegrationsSchema = z.object({
  linear: z.boolean(),
  github: z.boolean(),
  context7: z.boolean(),
  webSearch: z.boolean(),
  playwright: z.boolean(),
});
export type Integrations = z.infer<typeof IntegrationsSchema>;

const MEMORY_DEFAULTS = {
  enabled: false,
  dbPath: '.project-state/memory.db',
  tokenBudget: 2000,
  maxResults: 8,
  worthinessThreshold: 0.5,
} as const;

export const MemoryConfigSchema = z
  .object({
    enabled: z.boolean().default(MEMORY_DEFAULTS.enabled),
    dbPath: z.string().min(1).default(MEMORY_DEFAULTS.dbPath),
    ollamaUrl: z.string().url().optional(),
    tokenBudget: z.number().int().positive().default(MEMORY_DEFAULTS.tokenBudget),
    maxResults: z.number().int().positive().default(MEMORY_DEFAULTS.maxResults),
    worthinessThreshold: z.number().min(0).max(1).default(MEMORY_DEFAULTS.worthinessThreshold),
  })
  .default(MEMORY_DEFAULTS);
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

const ORCHESTRATOR_ROUTER_DEFAULTS = {
  enabled: true,
  model: 'haiku',
  timeoutMs: 60_000,
} as const;

const OrchestratorRouterSchema = z
  .object({
    enabled: z.boolean().default(ORCHESTRATOR_ROUTER_DEFAULTS.enabled),
    model: z.string().default(ORCHESTRATOR_ROUTER_DEFAULTS.model),
    timeoutMs: z.number().default(ORCHESTRATOR_ROUTER_DEFAULTS.timeoutMs),
  })
  .default(ORCHESTRATOR_ROUTER_DEFAULTS);

const ORCHESTRATOR_TIMEOUT_DEFAULTS = {
  phaseMinutes: 30,
  idleHeartbeatMinutes: 5,
} as const;

const OrchestratorTimeoutsSchema = z
  .object({
    phaseMinutes: z.number().default(ORCHESTRATOR_TIMEOUT_DEFAULTS.phaseMinutes),
    idleHeartbeatMinutes: z.number().default(ORCHESTRATOR_TIMEOUT_DEFAULTS.idleHeartbeatMinutes),
  })
  .default(ORCHESTRATOR_TIMEOUT_DEFAULTS);

const ORCHESTRATOR_APPROVAL_GATE_DEFAULTS = {
  frame: 'editor',
  sync: 'prompt',
} as const;

const OrchestratorApprovalGateSchema = z
  .object({
    frame: z.enum(['editor', 'inline', 'pause', 'auto']).default(ORCHESTRATOR_APPROVAL_GATE_DEFAULTS.frame),
    sync: z.enum(['prompt', 'pause', 'auto']).default(ORCHESTRATOR_APPROVAL_GATE_DEFAULTS.sync),
    editor: z.string().optional(),
  })
  .default(ORCHESTRATOR_APPROVAL_GATE_DEFAULTS);

const ORCHESTRATOR_TUI_DEFAULTS = {
  enabled: true,
  maxStreamLines: 40,
} as const;

const OrchestratorTuiSchema = z
  .object({
    enabled: z.boolean().default(ORCHESTRATOR_TUI_DEFAULTS.enabled),
    maxStreamLines: z.number().default(ORCHESTRATOR_TUI_DEFAULTS.maxStreamLines),
  })
  .default(ORCHESTRATOR_TUI_DEFAULTS);

export const OrchestratorConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['auto', 'manual']).default('manual'),
  claudeCodeBinary: z.string().default('claude'),
  router: z.preprocess((value) => value ?? {}, OrchestratorRouterSchema),
  timeouts: z.preprocess((value) => value ?? {}, OrchestratorTimeoutsSchema),
  approvalGate: z.preprocess((value) => value ?? {}, OrchestratorApprovalGateSchema),
  tui: z.preprocess((value) => value ?? {}, OrchestratorTuiSchema),
});
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export const FeatherConfigSchema = z.object({
  version: z.literal(1),
  projectName: z.string().min(1),
  clients: ClientsSchema,
  models: z.array(ModelConfigSchema).min(1),
  packages: z.array(z.string()).default([]),
  integrations: IntegrationsSchema,
  stateDir: z.string().default('.project-state'),
  docsDir: z.string().default('project-docs'),
  workflow: z.string().default('project-docs/workflows/default.json'),
  memory: z.preprocess((value) => value ?? {}, MemoryConfigSchema),
  orchestrator: z.preprocess((value) => value ?? {}, OrchestratorConfigSchema),
});
export type FeatherConfig = z.infer<typeof FeatherConfigSchema>;

export const ProgressEntrySchema = z.object({
  timestamp: z.string(),
  role: ModelRoleSchema,
  message: z.string(),
});
export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

export const HandoffSchema = z.object({
  from: ModelRoleSchema,
  to: ModelRoleSchema,
  notes: z.string(),
  timestamp: z.string(),
});
export type Handoff = z.infer<typeof HandoffSchema>;

export const TaskStatusSchema = z.enum(['pending', 'active', 'blocked', 'done']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const VerificationCheckSchema = z.object({
  name: z.string(),
  status: z.enum(['pass', 'warn', 'fail']),
  message: z.string(),
});
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const VerificationResultSchema = z.object({
  phase: z.enum(['frame', 'build', 'critic']),
  verdict: z.enum(['pass', 'warn', 'fail']),
  checks: z.array(VerificationCheckSchema),
  timestamp: z.string(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const VerificationRunCheckResultSchema = z.object({
  status: z.enum(['pass', 'fail', 'skipped']),
  output: z.string().optional(),
  durationMs: z.number().nonnegative(),
});
export type VerificationRunCheckResult = z.infer<typeof VerificationRunCheckResultSchema>;

export const VerificationRunSummarySchema = z.object({
  lastRunAt: z.string().nullable(),
  checks: z.record(z.string(), VerificationRunCheckResultSchema),
});
export type VerificationRunSummary = z.infer<typeof VerificationRunSummarySchema>;

export const PhaseCompletionSchema = z.object({
  phase: ModelRoleSchema,
  verdict: z.enum(['pass', 'warn', 'fail']).optional(),
  summary: z.string(),
  completedAt: z.string(),
  durationSeconds: z.number().optional(),
});
export type PhaseCompletion = z.infer<typeof PhaseCompletionSchema>;

export const ApprovalRecordSchema = z.object({
  phase: z.enum(['frame', 'sync']),
  approvedAt: z.string(),
  modified: z.boolean(),
  mode: z.enum(['editor', 'inline', 'pause', 'prompt', 'auto']),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export const OrchestratorLockSchema = z.object({
  holderPid: z.number(),
  acquiredAt: z.string(),
  heartbeatAt: z.string(),
});
export type OrchestratorLock = z.infer<typeof OrchestratorLockSchema>;

export const ProjectOrchestratorStateSchema = z.object({
  status: z.enum(['idle', 'running', 'paused', 'awaiting-approval']),
  pid: z.number().optional(),
  startedAt: z.string().optional(),
  heartbeatAt: z.string().optional(),
});
export type ProjectOrchestratorState = z.infer<typeof ProjectOrchestratorStateSchema>;

export const TaskEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  assignedRole: ModelRoleSchema.optional(),
  dependsOn: z.array(z.string()).optional(),
  progress: z.array(ProgressEntrySchema),
  handoff: HandoffSchema.optional(),
  reviewNotes: z.string().optional(),
  verifications: z.array(VerificationResultSchema).optional(),
  verification: VerificationRunSummarySchema.optional(),
  sessionId: z.string().optional(),
  phaseCompletions: z.array(PhaseCompletionSchema).optional(),
  approvals: z.array(ApprovalRecordSchema).optional(),
  orchestratorLock: OrchestratorLockSchema.optional(),
});
export type TaskEntry = z.infer<typeof TaskEntrySchema>;

export const ProjectStateSchema = z.object({
  version: z.literal(1),
  currentTask: z.string().nullable(),
  tasks: z.array(TaskEntrySchema),
  lastUpdated: z.string(),
  orchestrator: ProjectOrchestratorStateSchema.optional(),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;
