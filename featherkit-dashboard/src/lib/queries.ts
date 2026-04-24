import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AgentInteraction,
  Memory as MockMemory,
  Project,
  TaskEntry,
  VerificationTool,
  WorkflowEdge,
  WorkflowNode,
} from '@/data/mock';
import { BUILTIN_AGENTS, getBuiltInAgentByRole } from '@/lib/builtin-agents';
import { USE_MOCK } from '@/lib/env';
import { apiGet, apiPatch, apiPost, apiPut } from './api';

async function loadMockData() {
  return import('@/data/mock');
}

export type ApiProgressEntry = {
  timestamp: string;
  role: 'frame' | 'build' | 'critic' | 'sync';
  message: string;
};

export type ApiTask = {
  id: string;
  title: string;
  status: TaskEntry['status'];
  assignedRole?: TaskEntry['role'];
  dependsOn?: string[];
  progress: ApiProgressEntry[];
  reviewNotes?: string;
  verification?: ApiVerificationSummary;
};

export type ApiProjectState = {
  version: 1;
  currentTask: string | null;
  tasks: ApiTask[];
  lastUpdated: string;
  config?: {
    memory?: {
      enabled?: boolean;
    };
  };
  orchestrator?: {
    status: 'idle' | 'running' | 'paused' | 'awaiting-approval';
    pid?: number;
    startedAt?: string;
    heartbeatAt?: string;
  };
};

export type ApiWorkflowNode = {
  id: string;
  role: 'frame' | 'build' | 'critic' | 'sync';
  agent?: string;
  model?: string;
  promptTemplate?: string;
  gate?: 'editor' | 'inline' | 'pause' | 'auto' | 'prompt';
  loopback?: string;
  requires?: string[];
  x?: number;
  y?: number;
};

export type ApiWorkflowEdge = {
  from: string;
  to: string;
  condition?: 'pass' | 'warn' | 'fail' | 'default';
};

export type ApiWorkflow = {
  version: 1;
  start: string;
  nodes: ApiWorkflowNode[];
  edges: ApiWorkflowEdge[];
};

export type ApiConnections = {
  mcpServers: Record<string, { command?: string; args?: string[]; transport?: string } & Record<string, unknown>>;
  providers: Array<{ provider: string; connected: boolean }>;
};

export type ApiModelConfig = {
  role: string;
  provider: string;
  model: string;
};

export type ApiAgents = {
  models: ApiModelConfig[];
};

export type ApiVerificationCheck = {
  status: 'pass' | 'fail' | 'skipped';
  output?: string;
  durationMs: number;
};

export type ApiVerificationSummary = {
  lastRunAt: string | null;
  checks: Record<string, ApiVerificationCheck>;
};

export type ApiChatAck = {
  ok: true;
  queued: true;
  requestId: string;
  projectId: string;
};

export type ApiHistoryEvent = Record<string, unknown>;

type PatchTaskVariables = {
  taskId: string;
  status: TaskEntry['status'];
};

type CreateTaskVariables = {
  id: string;
  title: string;
  dependsOn?: string[];
};

function formatRelativeTime(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes <= 0) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

async function getMockState(): Promise<ApiProjectState> {
  const { FK_DATA } = await loadMockData();

  return {
    version: 1,
    currentTask: FK_DATA.tasks.find((task) => task.status === 'active')?.id ?? null,
    lastUpdated: new Date().toISOString(),
    orchestrator: {
      status: FK_DATA.orchestrator.status,
      pid: FK_DATA.orchestrator.pid,
    },
    config: {
      memory: {
        enabled: true,
      },
    },
    tasks: FK_DATA.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      assignedRole: task.role,
      dependsOn: task.dependsOn,
      reviewNotes: task.blockReason,
      progress: task.progress
        ? [{
            timestamp: new Date().toISOString(),
            role: task.role ?? 'build',
            message: task.progress,
          }]
        : [],
    })),
  };
}

async function getMockWorkflow(): Promise<ApiWorkflow> {
  const { FK_DATA } = await loadMockData();
  const agentNodes = FK_DATA.workflowNodes.filter((node) => node.type === 'agent');
  return {
    version: 1,
    start: agentNodes[0]?.id ?? 'frame',
    nodes: agentNodes.map((node) => ({
      id: node.id,
      role: (node.label.toLowerCase() as ApiWorkflowNode['role']) ?? 'build',
      agent: node.agentId,
      gate: undefined,
      loopback: undefined,
      requires: undefined,
    })),
    edges: FK_DATA.workflowEdges
      .filter((edge) => edge.from !== 'start')
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        condition: edge.condition,
      })),
  };
}

async function getMockConnections(): Promise<ApiConnections> {
  const { FK_DATA } = await loadMockData();
  return {
    mcpServers: Object.fromEntries(
      FK_DATA.mcpServers.map((server) => [server.name, { command: server.command, args: server.args, transport: server.transport }]),
    ),
    providers: FK_DATA.connections.map((connection) => ({
      provider: connection.provider,
      connected: connection.status === 'connected',
    })),
  };
}

function splitProviderModel(value: string): { provider: string; model: string } {
  const slashIndex = value.indexOf('/');
  if (slashIndex === -1) {
    return { provider: 'unknown', model: value };
  }

  return {
    provider: value.slice(0, slashIndex),
    model: value.slice(slashIndex + 1),
  };
}

async function getMockAgents(): Promise<ApiAgents> {
  return {
    models: BUILTIN_AGENTS.map((agent) => {
      const { provider, model } = splitProviderModel(agent.model);
      return {
        role: agent.roleColor,
        provider,
        model,
      };
    }),
  };
}

async function getMockVerification(taskId: string): Promise<ApiVerificationSummary> {
  const state = await getMockState();
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return { lastRunAt: null, checks: {} };
  }

  return task.verification ?? {
    lastRunAt: new Date().toISOString(),
    checks: {
      typecheck: { status: 'pass', durationMs: 320, output: 'Mock typecheck passed.' },
      test: { status: 'pass', durationMs: 840, output: 'Mock test run passed.' },
      lint: { status: 'skipped', durationMs: 0, output: 'No mock linter configured.' },
    },
  };
}

async function getMockEvents(limit: number): Promise<ApiHistoryEvent[]> {
  const { FK_DATA } = await loadMockData();

  return FK_DATA.events.slice(0, limit).map((event) => ({
    type: 'mock',
    ts: event.ts,
    kind: event.kind,
    tone: event.tone,
    message: event.message,
    taskId: event.task,
  }));
}

export type ApiMemoryType = MockMemory['type'];
export type ApiMemoryScope = MockMemory['scope'];

export type ApiMemoryGraphNode =
  | {
      kind: 'memory';
      id: string;
      title: string;
      content: string;
      type: ApiMemoryType;
      scope: ApiMemoryScope;
      isActive: boolean;
      createdAt?: string;
      updatedAt?: string;
      invalidAt?: string;
      confidence?: number;
      salience?: number;
      source?: string;
      sourceRef?: string;
      agent?: string | null;
      model?: string | null;
      supersededByIds: string[];
    }
  | {
      kind: 'entity';
      id: string;
      label: string;
      entityKind: string;
    }
  | {
      kind: 'scope';
      id: string;
      label: string;
      scope: ApiMemoryScope;
    };

export type ApiMemoryGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  weight: number | null;
  kind: 'memory' | 'entity' | 'scope';
};

export type ApiMemoryGraphData = {
  nodes: ApiMemoryGraphNode[];
  edges: ApiMemoryGraphEdge[];
  memoryCount: number;
  truncated: boolean;
  notice?: string;
};

export type ApiMemoryDetailData = {
  memory: Extract<ApiMemoryGraphNode, { kind: 'memory' }>;
  normalizedContent?: string;
  entities: Array<{ id: string; kind: string; value: string; normalizedValue?: string; role?: string }>;
  edges: Array<{ id: string; fromMemoryId: string; toMemoryId: string; relation: string; weight: number | null; createdAt?: string }>;
  accessLog: Array<{ id: string; actor?: string | null; reason?: string | null; accessedAt?: string }>;
  supersession: {
    supersedes: string[];
    supersededBy: string[];
  };
};

export type ApiRetrievalTraceRecord = {
  taskId: string;
  phase: 'frame' | 'build' | 'critic' | 'sync';
  sessionId?: string | null;
  recordedAt?: string;
  trace: {
    tokenBudget: number;
    used: number;
    included: Array<{
      memoryId: string;
      title?: string;
      score?: number;
      reasons?: string[];
      usedTokens?: number;
    }>;
    dropped: Array<{
      memoryId: string;
      title?: string;
      score?: number;
      reasons?: string[];
    }>;
  };
};

type RawMemoryGraphResponse = {
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
};

type RawMemoryDetailResponse = {
  memory?: Record<string, unknown> | null;
  entities?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  accessLog?: Array<Record<string, unknown>>;
} | null;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return undefined;
}

function asMemoryType(value: unknown): ApiMemoryType {
  return value === 'episodic' || value === 'procedural' || value === 'summary' ? value : 'semantic';
}

function asMemoryScope(value: unknown): ApiMemoryScope {
  switch (value) {
    case 'global':
    case 'user':
    case 'workspace':
    case 'repo':
    case 'branch':
    case 'agent':
    case 'model_role':
    case 'session':
      return value;
    default:
      return 'repo';
  }
}

function extractAgent(sourceRef: string | undefined, actor: string | undefined): string | null {
  const candidate = sourceRef ?? actor;
  if (!candidate) {
    return null;
  }

  const match = candidate.match(/(agent-[^/:\s]+)/);
  return match?.[1] ?? null;
}

function extractModel(memory: Record<string, unknown>): string | null {
  return asString(memory.model) ?? asString(memory.modelRole) ?? asString(memory.model_role) ?? null;
}

function normalizeMemoryNode(
  memory: Record<string, unknown>,
  fallback?: Partial<Extract<ApiMemoryGraphNode, { kind: 'memory' }>>,
): Extract<ApiMemoryGraphNode, { kind: 'memory' }> {
  const sourceRef = asString(memory.sourceRef) ?? asString(memory.source_ref) ?? fallback?.sourceRef;
  const accessActor = asString(memory.actor);

  return {
    kind: 'memory',
    id: asString(memory.id) ?? fallback?.id ?? 'memory',
    title: asString(memory.title) ?? fallback?.title ?? 'Untitled memory',
    content: asString(memory.content) ?? fallback?.content ?? '',
    type: asMemoryType(memory.type ?? fallback?.type),
    scope: asMemoryScope(memory.scope ?? fallback?.scope),
    isActive:
      typeof memory.isActive === 'boolean'
        ? memory.isActive
        : typeof memory.is_active === 'number'
          ? memory.is_active === 1
          : fallback?.isActive ?? true,
    createdAt:
      normalizeTimestamp(memory.createdAt) ??
      normalizeTimestamp(memory.created_at) ??
      fallback?.createdAt ??
      normalizeTimestamp(memory.updatedAt) ??
      normalizeTimestamp(memory.updated_at),
    updatedAt: normalizeTimestamp(memory.updatedAt) ?? normalizeTimestamp(memory.updated_at) ?? fallback?.updatedAt,
    invalidAt: normalizeTimestamp(memory.invalidAt) ?? normalizeTimestamp(memory.invalid_at) ?? fallback?.invalidAt,
    confidence: asNumber(memory.confidence) ?? fallback?.confidence,
    salience: asNumber(memory.salience) ?? fallback?.salience,
    source: asString(memory.sourceKind) ?? asString(memory.source_kind) ?? asString(memory.source) ?? fallback?.source,
    sourceRef,
    agent: extractAgent(sourceRef, accessActor) ?? fallback?.agent ?? null,
    model: extractModel(memory) ?? fallback?.model ?? null,
    supersededByIds: fallback?.supersededByIds ?? [],
  };
}

function normalizeMemoryDetail(raw: RawMemoryDetailResponse, fallback?: Partial<Extract<ApiMemoryGraphNode, { kind: 'memory' }>>): ApiMemoryDetailData | null {
  if (!raw?.memory) {
    return null;
  }

  const normalizedMemory = normalizeMemoryNode(raw.memory, fallback);
  const edges = (raw.edges ?? []).map((edge) => ({
    id: asString(edge.id) ?? `${normalizedMemory.id}-edge`,
    fromMemoryId: asString(edge.fromMemoryId) ?? asString(edge.from_memory_id) ?? normalizedMemory.id,
    toMemoryId: asString(edge.toMemoryId) ?? asString(edge.to_memory_id) ?? normalizedMemory.id,
    relation: asString(edge.relation) ?? 'related_to',
    weight: asNumber(edge.weight) ?? null,
    createdAt: normalizeTimestamp(edge.createdAt) ?? normalizeTimestamp(edge.created_at),
  }));

  return {
    memory: normalizedMemory,
    normalizedContent: asString(raw.memory.normalizedContent) ?? asString(raw.memory.normalized_content) ?? normalizedMemory.content,
    entities: (raw.entities ?? []).map((entity) => ({
      id: asString(entity.id) ?? `${normalizedMemory.id}-entity`,
      kind: asString(entity.kind) ?? 'entity',
      value: asString(entity.value) ?? asString(entity.name) ?? 'Unnamed entity',
      normalizedValue: asString(entity.normalizedValue) ?? asString(entity.normalized_value),
      role: asString(entity.role),
    })),
    edges,
    accessLog: (raw.accessLog ?? []).map((entry) => ({
      id: asString(entry.id) ?? `${normalizedMemory.id}-access`,
      actor: asString(entry.actor) ?? null,
      reason: asString(entry.reason) ?? null,
      accessedAt: normalizeTimestamp(entry.accessedAt) ?? normalizeTimestamp(entry.accessed_at),
    })),
    supersession: {
      supersedes: edges.filter((edge) => edge.relation === 'supersedes' && edge.fromMemoryId === normalizedMemory.id).map((edge) => edge.toMemoryId),
      supersededBy: edges.filter((edge) => edge.relation === 'supersedes' && edge.toMemoryId === normalizedMemory.id).map((edge) => edge.fromMemoryId),
    },
  };
}

async function buildMockMemoryGraph(scope: ApiMemoryScope): Promise<ApiMemoryGraphData> {
  const { FK_DATA } = await loadMockData();
  const scopedMemories = FK_DATA.memories.filter((memory) => memory.scope === scope).slice(0, 200);
  const visibleMemoryIds = new Set(scopedMemories.map((memory) => memory.id));
  const entityMap = new Map<string, Extract<ApiMemoryGraphNode, { kind: 'entity' }>>();

  const memoryNodes: Extract<ApiMemoryGraphNode, { kind: 'memory' }>[] = scopedMemories.map((memory) => ({
    kind: 'memory',
    id: memory.id,
    title: memory.title,
    content: memory.content,
    type: memory.type,
    scope: memory.scope,
    isActive: memory.isActive,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    invalidAt: memory.invalidAt,
    confidence: memory.confidence,
    salience: memory.salience,
    source: memory.sourceKind,
    sourceRef: memory.sourceRef,
    agent: extractAgent(memory.sourceRef, undefined),
    model: memory.modelRole ?? null,
    supersededByIds: FK_DATA.memoryEdges.filter((edge) => edge.edgeType === 'supersedes' && edge.toId === memory.id).map((edge) => edge.fromId),
  }));

  const memoryEdges: ApiMemoryGraphEdge[] = FK_DATA.memoryEdges
    .filter((edge) => visibleMemoryIds.has(edge.fromId) && visibleMemoryIds.has(edge.toId))
    .map((edge) => ({
      id: edge.id,
      from: edge.fromId,
      to: edge.toId,
      relation: edge.edgeType,
      weight: edge.weight,
      kind: 'memory',
    }));

  const entityEdges: ApiMemoryGraphEdge[] = [];
  for (const memory of scopedMemories) {
    for (const entityId of memory.entityIds) {
      const entity = FK_DATA.entities.find((candidate) => candidate.id === entityId);
      if (!entity) {
        continue;
      }

      const nodeId = `entity:${entity.id}`;
      entityMap.set(nodeId, {
        kind: 'entity',
        id: nodeId,
        label: entity.name,
        entityKind: entity.kind,
      });
      entityEdges.push({
        id: `${memory.id}-${nodeId}`,
        from: memory.id,
        to: nodeId,
        relation: 'about',
        weight: 0.5,
        kind: 'entity',
      });
    }
  }

  const scopeNode: Extract<ApiMemoryGraphNode, { kind: 'scope' }> = {
    kind: 'scope',
    id: `scope:${scope}`,
    label: scope,
    scope,
  };
  const scopeEdges: ApiMemoryGraphEdge[] = memoryNodes.map((memory) => ({
    id: `${memory.id}-scope-${scope}`,
    from: memory.id,
    to: scopeNode.id,
    relation: 'belongs_to_scope',
    weight: 1,
    kind: 'scope',
  }));

  return {
    nodes: [scopeNode, ...memoryNodes, ...entityMap.values()],
    edges: [...memoryEdges, ...entityEdges, ...scopeEdges],
    memoryCount: scopedMemories.length,
    truncated: FK_DATA.memories.filter((memory) => memory.scope === scope).length > 200,
    notice:
      FK_DATA.memories.filter((memory) => memory.scope === scope).length > 200
        ? 'Showing top 200 memories by recency.'
        : undefined,
  };
}

async function fetchMemoryGraph(scope: ApiMemoryScope): Promise<ApiMemoryGraphData> {
  if (USE_MOCK) {
    return await buildMockMemoryGraph(scope);
  }

  const raw = await apiGet<RawMemoryGraphResponse>(`/api/memory/graph?scope=${encodeURIComponent(scope)}`);
  const rawNodes = raw.nodes ?? [];
  const limitedNodes = rawNodes.slice(0, 200);
  const memoryNodes = limitedNodes.map((node) => normalizeMemoryNode(node));

  const visibleMemoryIds = new Set(memoryNodes.map((node) => node.id));
  const memoryEdges: ApiMemoryGraphEdge[] = (raw.edges ?? [])
    .map((edge) => ({
      id: asString(edge.id) ?? `edge-${Math.random()}`,
      from: asString(edge.from) ?? asString(edge.from_memory_id) ?? '',
      to: asString(edge.to) ?? asString(edge.to_memory_id) ?? '',
      relation: asString(edge.relation) ?? 'related_to',
      weight: asNumber(edge.weight) ?? null,
      kind: 'memory' as const,
    }))
    .filter((edge) => visibleMemoryIds.has(edge.from) && visibleMemoryIds.has(edge.to));

  const supersededByIds = new Map<string, string[]>();
  for (const edge of memoryEdges) {
    if (edge.relation !== 'supersedes') continue;
    supersededByIds.set(edge.to, [...(supersededByIds.get(edge.to) ?? []), edge.from]);
  }

  const scopedMemoryNodes = memoryNodes.map((memory) => ({
    ...memory,
    supersededByIds: supersededByIds.get(memory.id) ?? memory.supersededByIds,
  }));

  const scopeNodes = [...new Set(scopedMemoryNodes.map((node) => node.scope))].map((nodeScope) => ({
    kind: 'scope' as const,
    id: `scope:${nodeScope}`,
    label: nodeScope,
    scope: nodeScope,
  }));
  const scopeEdges: ApiMemoryGraphEdge[] = scopedMemoryNodes.map((memory) => ({
    id: `${memory.id}-scope-${memory.scope}`,
    from: memory.id,
    to: `scope:${memory.scope}`,
    relation: 'belongs_to_scope',
    weight: 1,
    kind: 'scope',
  }));

  return {
    nodes: [...scopeNodes, ...scopedMemoryNodes],
    edges: [...memoryEdges, ...scopeEdges],
    memoryCount: rawNodes.length,
    truncated: rawNodes.length > limitedNodes.length,
    notice: rawNodes.length > limitedNodes.length ? 'Showing top 200 memories by recency.' : undefined,
  };
}

async function buildMockRetrievalTrace(taskId: string): Promise<ApiRetrievalTraceRecord[]> {
  const { FK_DATA } = await loadMockData();
  if (!taskId) {
    return [];
  }

  return [
    {
      taskId,
      phase: 'frame',
      sessionId: 'mock-session',
      recordedAt: new Date().toISOString(),
      trace: {
        tokenBudget: 2000,
        used: 186,
        included: [
          {
            memoryId: FK_DATA.memories[0]?.id ?? 'mem-1',
            title: FK_DATA.memories[0]?.title,
            score: 0.98,
            reasons: ['fts:project', 'scope:repo'],
            usedTokens: 74,
          },
          {
            memoryId: FK_DATA.memories[2]?.id ?? 'mem-3',
            title: FK_DATA.memories[2]?.title,
            score: 0.88,
            reasons: ['vector:workflow', 'rerank:procedural-fit'],
            usedTokens: 52,
          },
        ],
        dropped: [
          {
            memoryId: FK_DATA.memories[7]?.id ?? 'mem-8',
            title: FK_DATA.memories[7]?.title,
            score: 0.41,
            reasons: ['scope:session', 'budget-near-miss'],
          },
        ],
      },
    },
  ];
}

export function useMemoryGraph(scope: ApiMemoryScope) {
  return useQuery({
    queryKey: ['memory', 'graph', scope],
    queryFn: () => fetchMemoryGraph(scope),
    staleTime: USE_MOCK ? Infinity : 10_000,
  });
}

export function useMemoryTimeline(scope: ApiMemoryScope) {
  const graphQuery = useMemoryGraph(scope);

  const data = useMemo(() => {
    const graph = graphQuery.data;
    if (!graph) {
      return [] as Extract<ApiMemoryGraphNode, { kind: 'memory' }>[];
    }

    const createdById = new Map(
      graph.nodes
        .filter((node): node is Extract<ApiMemoryGraphNode, { kind: 'memory' }> => node.kind === 'memory')
        .map((node) => [node.id, node.createdAt ?? node.updatedAt]),
    );

    const invalidatedAt = new Map<string, string | undefined>();
    for (const edge of graph.edges) {
      if (edge.relation === 'supersedes') {
        invalidatedAt.set(edge.to, createdById.get(edge.from));
      }
    }

    return graph.nodes
      .filter((node): node is Extract<ApiMemoryGraphNode, { kind: 'memory' }> => node.kind === 'memory')
      .map((node) => ({ ...node, invalidAt: node.invalidAt ?? invalidatedAt.get(node.id) }))
      .sort((a, b) => (Date.parse(b.createdAt ?? b.updatedAt ?? '') || 0) - (Date.parse(a.createdAt ?? a.updatedAt ?? '') || 0));
  }, [graphQuery.data]);

  return {
    ...graphQuery,
    data,
  };
}

export function useMemoryDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ['memory', 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => {
      if (!id) {
        return null;
      }

      if (USE_MOCK) {
        const { FK_DATA } = await loadMockData();
        const memory = FK_DATA.memories.find((candidate) => candidate.id === id);
        if (!memory) {
          return null;
        }

        return {
          memory: {
            kind: 'memory' as const,
            id: memory.id,
            title: memory.title,
            content: memory.content,
            type: memory.type,
            scope: memory.scope,
            isActive: memory.isActive,
            createdAt: memory.createdAt,
            updatedAt: memory.updatedAt,
            invalidAt: memory.invalidAt,
            confidence: memory.confidence,
            salience: memory.salience,
            source: memory.sourceKind,
            sourceRef: memory.sourceRef,
            agent: extractAgent(memory.sourceRef, undefined),
            model: memory.modelRole ?? null,
            supersededByIds: FK_DATA.memoryEdges.filter((edge) => edge.edgeType === 'supersedes' && edge.toId === memory.id).map((edge) => edge.fromId),
          },
          normalizedContent: memory.content,
          entities: FK_DATA.entities
            .filter((entity) => memory.entityIds.includes(entity.id))
            .map((entity) => ({
              id: entity.id,
              kind: entity.kind,
              value: entity.name,
              normalizedValue: entity.name.toLowerCase(),
            })),
          edges: FK_DATA.memoryEdges
            .filter((edge) => edge.fromId === memory.id || edge.toId === memory.id)
            .map((edge) => ({
              id: edge.id,
              fromMemoryId: edge.fromId,
              toMemoryId: edge.toId,
              relation: edge.edgeType,
              weight: edge.weight,
              createdAt: memory.updatedAt,
            })),
          accessLog: [
            {
              id: `${memory.id}-access`,
              actor: extractAgent(memory.sourceRef, undefined),
              reason: memory.sourceRef ?? memory.sourceKind,
              accessedAt: memory.updatedAt,
            },
          ],
          supersession: {
            supersedes: FK_DATA.memoryEdges.filter((edge) => edge.edgeType === 'supersedes' && edge.fromId === memory.id).map((edge) => edge.toId),
            supersededBy: FK_DATA.memoryEdges.filter((edge) => edge.edgeType === 'supersedes' && edge.toId === memory.id).map((edge) => edge.fromId),
          },
        } satisfies ApiMemoryDetailData;
      }

      const raw = await apiGet<RawMemoryDetailResponse>(`/api/memory/${encodeURIComponent(id)}`);
      return normalizeMemoryDetail(raw);
    },
    staleTime: USE_MOCK ? Infinity : 10_000,
  });
}

export function useRetrievalTrace(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ['memory', 'trace', taskId],
    enabled: Boolean(taskId),
    queryFn: async () => {
      if (!taskId) {
        return [] as ApiRetrievalTraceRecord[];
      }

      if (USE_MOCK) {
        return await buildMockRetrievalTrace(taskId);
      }

      const raw = await apiGet<unknown[]>(`/api/memory/trace/${encodeURIComponent(taskId)}`);
      return (Array.isArray(raw) ? raw : []).map((entry) => {
        const record = entry as Record<string, unknown>;
        const trace = (record.trace ?? {}) as Record<string, unknown>;
        return {
          taskId: asString(record.taskId) ?? taskId,
          phase: (asString(record.phase) as ApiRetrievalTraceRecord['phase']) ?? 'frame',
          sessionId: asString(record.sessionId) ?? null,
          recordedAt: normalizeTimestamp(record.recordedAt),
          trace: {
            tokenBudget: asNumber(trace.tokenBudget) ?? 0,
            used: asNumber(trace.used) ?? 0,
            included: Array.isArray(trace.included)
              ? trace.included.map((item) => {
                  const included = item as Record<string, unknown>;
                  return {
                    memoryId: asString(included.memoryId) ?? 'memory',
                    title: asString(included.title),
                    score: asNumber(included.score),
                    reasons: Array.isArray(included.reasons) ? included.reasons.filter((value): value is string => typeof value === 'string') : undefined,
                    usedTokens: asNumber(included.usedTokens),
                  };
                })
              : [],
            dropped: Array.isArray(trace.dropped)
              ? trace.dropped.map((item) => {
                  const dropped = item as Record<string, unknown>;
                  return {
                    memoryId: asString(dropped.memoryId) ?? 'memory',
                    title: asString(dropped.title),
                    score: asNumber(dropped.score),
                    reasons: Array.isArray(dropped.reasons) ? dropped.reasons.filter((value): value is string => typeof value === 'string') : undefined,
                  };
                })
              : [],
          },
        } satisfies ApiRetrievalTraceRecord;
      });
    },
    staleTime: USE_MOCK ? Infinity : 5_000,
  });
}

export function toUiTask(task: ApiTask, state: ApiProjectState): TaskEntry {
  const latestProgress = task.progress.at(-1);
  const role = task.assignedRole ?? latestProgress?.role;
  const waitingForInput =
    state.orchestrator?.status === 'awaiting-approval' &&
    state.currentTask === task.id &&
    (role === 'frame' || role === 'sync');

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    phase: role,
    role,
    progress: latestProgress?.message,
    blockReason: task.status === 'blocked' ? task.reviewNotes ?? latestProgress?.message ?? 'Blocked' : undefined,
    dependsOn: task.dependsOn,
    updatedAt: formatRelativeTime(latestProgress?.timestamp ?? state.lastUpdated),
    waitingForInput,
  };
}

function defaultVerificationTools(): VerificationTool[] {
  return [
    { id: 'typecheck', name: 'typecheck', command: 'tsc --noEmit', enabled: true, lastStatus: 'idle' },
    { id: 'test', name: 'test', command: 'bun test', enabled: true, lastStatus: 'idle' },
    { id: 'build', name: 'build', command: 'bun run build', enabled: true, lastStatus: 'idle' },
  ];
}

function buildPendingInputs(state: ApiProjectState): AgentInteraction[] {
  if (state.orchestrator?.status !== 'awaiting-approval' || !state.currentTask) {
    return [];
  }

  const task = state.tasks.find((entry) => entry.id === state.currentTask);
  if (!task) {
    return [];
  }

  const role = task.assignedRole ?? task.progress.at(-1)?.role ?? 'frame';
  const agentName = role[0]!.toUpperCase() + role.slice(1);

  return [{
    id: `pending-${task.id}`,
    agentId: `agent-${role}`,
    agentName,
    taskId: task.id,
    taskTitle: task.title,
    question: `Approval required to continue the ${role} phase.`,
    timestamp: formatRelativeTime(state.lastUpdated) ?? 'just now',
    status: 'pending',
  }];
}

export function buildProjectsFromState(state: ApiProjectState): Project[] {
  const tasks = state.tasks.map((task) => toUiTask(task, state));
  return [{
    id: 'workspace',
    name: 'Current workspace',
    path: '.',
    branch: 'local',
    commit: state.lastUpdated.slice(0, 10),
    status: state.orchestrator?.status === 'running' ? 'active' : 'idle',
    tasks,
    verificationTools: defaultVerificationTools(),
    verificationNotes: 'Verification runs are reported by the backend orchestrator.',
    pendingInputs: buildPendingInputs(state),
  }];
}

export function workflowNodeLabel(role: ApiWorkflowNode['role']): string {
  return role[0]!.toUpperCase() + role.slice(1);
}

export function useStateQuery() {
  return useQuery({
    queryKey: ['state'],
    queryFn: () => (USE_MOCK ? getMockState() : apiGet<ApiProjectState>('/api/state')),
    staleTime: USE_MOCK ? Infinity : 2_000,
  });
}

export function useWorkflowQuery() {
  return useQuery({
    queryKey: ['workflow'],
    queryFn: () => (USE_MOCK ? getMockWorkflow() : apiGet<ApiWorkflow>('/api/workflow')),
    staleTime: USE_MOCK ? Infinity : 5_000,
  });
}

export function useConnectionsQuery() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => (USE_MOCK ? getMockConnections() : apiGet<ApiConnections>('/api/connections')),
    staleTime: USE_MOCK ? Infinity : 10_000,
  });
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => (USE_MOCK ? getMockAgents() : apiGet<ApiAgents>('/api/agents')),
    staleTime: USE_MOCK ? Infinity : 10_000,
  });
}

export function useDashboardProjects(): Project[] {
  const { data } = useStateQuery();

  return useMemo(() => {
    if (data) {
      return buildProjectsFromState(data);
    }

    return [];
  }, [data]);
}

export function usePatchTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, status }: PatchTaskVariables) => {
      if (USE_MOCK) {
        return { id: taskId, status };
      }

      return apiPatch(`/api/tasks/${encodeURIComponent(taskId)}`, { status });
    },
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['state'] });

      const previousState = queryClient.getQueryData<ApiProjectState>(['state']);
      if (!previousState) {
        return { previousState };
      }

      const optimisticState: ApiProjectState = {
        ...previousState,
        currentTask:
          (status === 'blocked' || status === 'pending') && previousState.currentTask === taskId
            ? null
            : previousState.currentTask,
        tasks: previousState.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status,
                progress:
                  status === task.status
                    ? task.progress
                    : [
                        ...task.progress,
                        {
                          timestamp: new Date().toISOString(),
                          role: task.assignedRole ?? task.progress.at(-1)?.role ?? 'build',
                          message: `Moved to ${status}`,
                        },
                      ],
              }
            : task,
        ),
      };

      queryClient.setQueryData(['state'], optimisticState);
      return { previousState };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(['state'], context.previousState);
      }
    },
    onSettled: async () => {
      if (!USE_MOCK) {
        await queryClient.invalidateQueries({ queryKey: ['state'] });
      }
    },
  });
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title, dependsOn }: CreateTaskVariables) => {
      if (USE_MOCK) {
        const existingState = queryClient.getQueryData<ApiProjectState>(['state']);
        if (existingState?.tasks.some((task) => task.id === id)) {
          throw new Error(`Task ${id} already exists.`);
        }

        return {
          id,
          title,
          status: 'pending',
          dependsOn,
          progress: [],
        } satisfies ApiTask;
      }

      return apiPost<ApiTask>('/api/tasks', { id, title, dependsOn });
    },
    onSuccess: async (task) => {
      queryClient.setQueryData<ApiProjectState | undefined>(['state'], (previousState) => {
        if (!previousState) {
          return previousState;
        }

        return {
          ...previousState,
          lastUpdated: new Date().toISOString(),
          tasks: previousState.tasks.some((entry) => entry.id === task.id)
            ? previousState.tasks.map((entry) => (entry.id === task.id ? task : entry))
            : [...previousState.tasks, task],
        };
      });

      if (!USE_MOCK) {
        await queryClient.invalidateQueries({ queryKey: ['state'] });
      }
    },
  });
}

export function usePutWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workflow: ApiWorkflow) => {
      if (USE_MOCK) {
        return workflow;
      }

      return apiPut<ApiWorkflow>('/api/workflow', workflow);
    },
    onSuccess: async (workflow) => {
      queryClient.setQueryData(['workflow'], workflow);
      if (!USE_MOCK) {
        await queryClient.invalidateQueries({ queryKey: ['workflow'] });
      }
    },
  });
}

export function useUpdateAgents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agents: ApiAgents) => {
      if (USE_MOCK) {
        return agents;
      }

      return apiPut<ApiAgents>('/api/agents', agents);
    },
    onSuccess: async (agents) => {
      queryClient.setQueryData(['agents'], agents);
      if (!USE_MOCK) {
        await queryClient.invalidateQueries({ queryKey: ['agents'] });
      }
    },
  });
}

export function useRunTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      if (USE_MOCK) {
        return { ok: true, taskId, queued: true };
      }

      return apiPost(`/api/tasks/${encodeURIComponent(taskId)}/run`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['state'] });
    },
  });
}

export function useSendChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, message }: { projectId: string; message: string }) => {
      if (USE_MOCK) {
        return {
          ok: true,
          queued: true,
          requestId: `mock-${Date.now()}`,
          projectId,
        } satisfies ApiChatAck;
      }

      return apiPost<ApiChatAck>('/api/chat', { projectId, message });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useEventsQuery(limit = 50) {
  return useQuery({
    queryKey: ['events', limit],
    queryFn: () => (USE_MOCK ? getMockEvents(limit) : apiGet<ApiHistoryEvent[]>(`/api/events?limit=${encodeURIComponent(String(limit))}`)),
    staleTime: USE_MOCK ? Infinity : 2_000,
    refetchInterval: USE_MOCK ? false : 5_000,
  });
}

export function useVerificationQuery(taskId: string) {
  return useQuery({
    queryKey: ['verification', taskId],
    queryFn: () => (USE_MOCK ? getMockVerification(taskId) : apiGet<ApiVerificationSummary>(`/api/verification/${encodeURIComponent(taskId)}`)),
    staleTime: USE_MOCK ? Infinity : 5_000,
    enabled: taskId.length > 0,
  });
}

export function useRunVerification(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (USE_MOCK) {
        return getMockVerification(taskId);
      }

      return apiPost<ApiVerificationSummary>(`/api/verification/${encodeURIComponent(taskId)}/run`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['verification', taskId] });
      await queryClient.invalidateQueries({ queryKey: ['state'] });
    },
  });
}

export type ApiSetupDetectResponse = {
  checks: Record<string, string>;
};

export function useSetupDetectQuery() {
  return useQuery({
    queryKey: ['verification-setup-detect'],
    queryFn: () => (USE_MOCK
      ? Promise.resolve({ checks: { typecheck: 'tsc --noEmit', test: 'bun test', lint: 'eslint src' } })
      : apiGet<ApiSetupDetectResponse>('/api/verification/setup-detect')),
    staleTime: Infinity,
    enabled: false,
  });
}

export function useSetupVerificationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (checks: Record<string, string>) => {
      if (USE_MOCK) {
        return { ok: true, checks };
      }

      return apiPost<{ ok: boolean; checks: Record<string, string> }>('/api/verification/setup', { checks });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['state'] });
    },
  });
}

export function buildWorkflowGraph(workflow: ApiWorkflow): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const builtInAgents = new Map(BUILTIN_AGENTS.map((agent) => [agent.roleColor, agent]));

  const nodes: WorkflowNode[] = workflow.nodes.map((node, index) => ({
    id: node.id,
    type: 'agent',
    agentId: node.agent ?? getBuiltInAgentByRole(node.role)?.id ?? undefined,
    label: workflowNodeLabel(node.role),
    model: builtInAgents.get(node.role)?.model,
    gate: node.gate,
    x: 240 + index * 180,
    y: 140,
  }));

  const edges: WorkflowEdge[] = workflow.edges.map((edge, index) => ({
    id: `workflow-${index}-${edge.from}-${edge.to}`,
    from: edge.from,
    to: edge.to,
    condition: edge.condition === 'warn' ? 'default' : edge.condition,
    animated: edge.condition === 'fail',
  }));

  return { nodes, edges };
}
