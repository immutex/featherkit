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
});
export type Integrations = z.infer<typeof IntegrationsSchema>;

export const FeatherConfigSchema = z.object({
  version: z.literal(1),
  projectName: z.string().min(1),
  clients: ClientsSchema,
  models: z.array(ModelConfigSchema).min(1),
  integrations: IntegrationsSchema,
  stateDir: z.string().default('.project-state'),
  docsDir: z.string().default('project-docs'),
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

export const TaskEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  assignedRole: ModelRoleSchema.optional(),
  dependsOn: z.array(z.string()).optional(),
  progress: z.array(ProgressEntrySchema),
  handoff: HandoffSchema.optional(),
  reviewNotes: z.string().optional(),
});
export type TaskEntry = z.infer<typeof TaskEntrySchema>;

export const ProjectStateSchema = z.object({
  version: z.literal(1),
  currentTask: z.string().nullable(),
  tasks: z.array(TaskEntrySchema),
  lastUpdated: z.string(),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;
