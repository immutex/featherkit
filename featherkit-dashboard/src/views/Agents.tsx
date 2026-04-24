import { useMemo, useState } from 'react';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { MotionCard, Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { type ApiModelConfig, useAgentsQuery, useUpdateAgents, useCreateAgentMutation, useDeleteAgentMutation } from '@/lib/queries';
import { motion, AnimatePresence } from 'framer-motion';
import { stagger, staggerItem, fadeUp } from '@/lib/motion';
import { Bot, Save, X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

// ── Provider / model catalog ──────────────────────────────────────────

const KNOWN_PROVIDERS = ['anthropic', 'openai', 'openrouter', 'zai', 'google'] as const;
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  zai: 'Zhipu AI',
  google: 'Google',
};

const MODELS_BY_PROVIDER: Record<string, string[]> = {
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o'],
  openrouter: [],
  zai: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};

// ── Constants ─────────────────────────────────────────────────────────

const BUILT_IN_ROLES = new Set(['frame', 'build', 'critic', 'sync']);
const ROLE_ORDER = ['frame', 'build', 'critic', 'sync'];

// ── Types ─────────────────────────────────────────────────────────────

type AgentConfig = {
  id: string;
  name: string;
  role: string;
  roleColor: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  isBuiltIn: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────

function roleLabel(role: string): string {
  return role[0]?.toUpperCase() + role.slice(1) || role;
}

function toAgentConfig(model: ApiModelConfig): AgentConfig {
  const isBuiltIn = BUILT_IN_ROLES.has(model.role);
  return {
    id: model.role,
    name: roleLabel(model.role),
    role: model.role,
    roleColor: isBuiltIn ? model.role : 'accent',
    provider: model.provider,
    model: model.model,
    systemPrompt: model.systemPrompt,
    isBuiltIn,
  };
}

// ── Color maps ────────────────────────────────────────────────────────

const colorMap: Record<string, string> = {
  frame: 'bg-role-frame/10 text-role-frame border-role-frame/20',
  build: 'bg-role-build/10 text-role-build border-role-build/20',
  critic: 'bg-role-critic/10 text-role-critic border-role-critic/20',
  sync: 'bg-role-sync/10 text-role-sync border-role-sync/20',
  accent: 'bg-accent-dim text-accent border-accent/20',
};

const colorBorder: Record<string, string> = {
  frame: 'border-t-role-frame',
  build: 'border-t-role-build',
  critic: 'border-t-role-critic',
  sync: 'border-t-role-sync',
  accent: 'border-t-accent',
};

// ── Main view ─────────────────────────────────────────────────────────

export function AgentsView() {
  const agentsQuery = useAgentsQuery();
  const updateAgents = useUpdateAgents();
  const createAgent = useCreateAgentMutation();
  const deleteAgent = useDeleteAgentMutation();
  const [editing, setEditing] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const agents = useMemo(
    () => [...(agentsQuery.data?.models ?? [])]
      .sort((a, b) => {
        const aIndex = ROLE_ORDER.indexOf(a.role);
        const bIndex = ROLE_ORDER.indexOf(b.role);
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      })
      .map(toAgentConfig),
    [agentsQuery.data],
  );

  async function handleSave(agent: AgentConfig) {
    if (!agentsQuery.data) {
      return;
    }

    await updateAgents.mutateAsync({
      models: agentsQuery.data.models.map((model) =>
        model.role === agent.role
          ? { role: agent.role, provider: agent.provider, model: agent.model, systemPrompt: agent.systemPrompt }
          : model,
      ),
    });
    setEditing(null);
  }

  async function handleCreate(role: string, provider: string, model: string, systemPrompt?: string) {
    await createAgent.mutateAsync({ role, provider, model, systemPrompt });
    setShowNewForm(false);
  }

  async function handleDelete(role: string) {
    await deleteAgent.mutateAsync(role);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface/40">
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel className="mb-1">Configuration</SectionLabel>
            <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
          </div>
          <Button
            variant="accent"
            size="sm"
            onClick={() => { setShowNewForm(true); setEditing(null); }}
            disabled={showNewForm}
          >
            <Plus size={14} />New Agent
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto fk-scroll p-8">
        {agentsQuery.isLoading ? (
          <Card className="p-6 text-sm text-ink-4">Loading agent models…</Card>
        ) : agentsQuery.isError ? (
          <Card className="p-6 space-y-3">
            <div className="text-sm text-err">{agentsQuery.error.message}</div>
            <Button variant="outline" size="sm" onClick={() => void agentsQuery.refetch()}>Retry</Button>
          </Card>
        ) : (
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div key="editor" variants={fadeUp} initial="initial" animate="animate" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
              <AgentEditor
                agent={agents.find(a => a.id === editing)}
                isSaving={updateAgents.isPending}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </motion.div>
          ) : showNewForm ? (
            <motion.div key="new-agent" variants={fadeUp} initial="initial" animate="animate" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
              <NewAgentForm
                existingRoles={new Set(agents.map(a => a.role))}
                isCreating={createAgent.isPending}
                onCreate={handleCreate}
                onCancel={() => setShowNewForm(false)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial="initial"
              animate="animate"
              variants={stagger(0.08)}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
            >
              {agents.map(agent => (
                <motion.div key={agent.id} variants={staggerItem}>
                  <AgentCard
                    agent={agent}
                    onEdit={() => { setEditing(agent.id); setShowNewForm(false); }}
                    onDelete={agent.isBuiltIn ? undefined : () => handleDelete(agent.role)}
                    isDeleting={deleteAgent.isPending}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ── Agent card ────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onEdit,
  onDelete,
  isDeleting,
}: {
  agent: AgentConfig;
  onEdit: () => void;
  onDelete?: () => void;
  isDeleting: boolean;
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <MotionCard className={cn('overflow-hidden hover:border-border-light transition-colors', colorBorder[agent.roleColor])}>
      <div className={cn('h-1', {
        'bg-role-frame': agent.roleColor === 'frame',
        'bg-role-build': agent.roleColor === 'build',
        'bg-role-critic': agent.roleColor === 'critic',
        'bg-role-sync': agent.roleColor === 'sync',
        'bg-accent': agent.roleColor === 'accent',
      })} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center border', colorMap[agent.roleColor])}>
              <Bot size={20} />
            </div>
            <div>
              <div className="text-base font-semibold">{agent.name}</div>
              <div className="text-xs text-ink-4 font-mono">{agent.provider}/{agent.model}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone="muted">{agent.role}</Badge>
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-ink-5 hover:text-err"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={isDeleting}
                title="Delete agent"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3 text-sm mb-4">
          <div>
            <div className="text-xs text-ink-5 uppercase tracking-wider mb-1">Provider</div>
            <div className="text-ink-2 font-medium">{PROVIDER_LABELS[agent.provider] ?? agent.provider}</div>
          </div>
          <div>
            <div className="text-xs text-ink-5 uppercase tracking-wider mb-1">Model</div>
            <div className="text-ink-3 font-mono break-all">{agent.model}</div>
          </div>
        </div>

        {agent.systemPrompt && (
          <div className="mb-4">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-ink-5 hover:text-ink-3 transition-colors"
              onClick={() => setShowPrompt(!showPrompt)}
            >
              {showPrompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              System prompt
            </button>
            {showPrompt && (
              <div className="mt-1.5 text-xs text-ink-4 bg-bg rounded-md p-3 border border-border whitespace-pre-wrap max-h-40 overflow-y-auto fk-scroll">
                {agent.systemPrompt}
              </div>
            )}
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>Edit</Button>
      </div>
    </MotionCard>
  );
}

// ── Provider/Model combo box ──────────────────────────────────────────

function ProviderSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isKnown = KNOWN_PROVIDERS.includes(value as typeof KNOWN_PROVIDERS[number]);
  const [showCustom, setShowCustom] = useState(!isKnown && value.length > 0);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <select
          value={showCustom ? '__other__' : value}
          onChange={(e) => {
            if (e.target.value === '__other__') {
              setShowCustom(true);
              onChange('');
            } else {
              setShowCustom(false);
              onChange(e.target.value);
            }
          }}
          className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        >
          <option value="" disabled>Select provider</option>
          {KNOWN_PROVIDERS.map((p) => (
            <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>
          ))}
          <option value="__other__">Other…</option>
        </select>
      </div>
      {showCustom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          placeholder="custom-provider"
          autoFocus
        />
      )}
    </div>
  );
}

function ModelSelect({
  provider,
  value,
  onChange,
}: {
  provider: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const models = MODELS_BY_PROVIDER[provider];
  const isKnown = models && models.length > 0;
  const [showCustom, setShowCustom] = useState(!isKnown || (value.length > 0 && !models?.includes(value)));

  if (!isKnown || showCustom) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink font-mono focus:border-accent focus:outline-none"
        placeholder="model-name"
        autoFocus={showCustom}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <select
        value={models.includes(value) ? value : ''}
        onChange={(e) => {
          if (e.target.value === '__other__') {
            setShowCustom(true);
            onChange('');
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink font-mono focus:border-accent focus:outline-none"
      >
        <option value="" disabled>Select model</option>
        {models.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
        <option value="__other__">Other…</option>
      </select>
    </div>
  );
}

// ── Agent editor ──────────────────────────────────────────────────────

function AgentEditor({
  agent,
  isSaving,
  onSave,
  onCancel,
}: {
  agent?: AgentConfig;
  isSaving: boolean;
  onSave: (a: AgentConfig) => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState(agent?.provider || '');
  const [model, setModel] = useState(agent?.model || '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');

  function handleSave() {
    if (!agent) {
      return;
    }

    onSave({
      ...agent,
      provider: provider.trim(),
      model: model.trim(),
      systemPrompt: systemPrompt.trim() || undefined,
    });
  }

  if (!agent) {
    return null;
  }

  return (
    <div className="max-w-[800px]">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Edit {agent.name}</h2>
          <Button variant="ghost" size="icon" onClick={onCancel}><X size={16} /></Button>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Role</label>
              <input
                value={agent.role}
                readOnly
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Provider</label>
              <ProviderSelect value={provider} onChange={(v) => { setProvider(v); setModel(''); }} />
            </div>
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Model</label>
              <ModelSelect key={provider} provider={provider} value={model} onChange={setModel} />
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">System prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none resize-y min-h-[100px] font-mono"
              placeholder="Optional system prompt for this agent…"
              rows={4}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button variant="accent" size="sm" onClick={handleSave} disabled={isSaving || provider.trim().length === 0 || model.trim().length === 0}>
              <Save size={14} />{isSaving ? 'Saving…' : 'Save Agent'}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── New agent form ────────────────────────────────────────────────────

function NewAgentForm({
  existingRoles,
  isCreating,
  onCreate,
  onCancel,
}: {
  existingRoles: Set<string>;
  isCreating: boolean;
  onCreate: (role: string, provider: string, model: string, systemPrompt?: string) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    const trimmedRole = role.trim().toLowerCase();
    if (!trimmedRole) {
      setError('Role name is required.');
      return;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(trimmedRole)) {
      setError('Role must be lowercase alphanumeric with dashes, starting with a letter.');
      return;
    }
    if (existingRoles.has(trimmedRole)) {
      setError(`Role "${trimmedRole}" already exists.`);
      return;
    }
    if (!provider.trim()) {
      setError('Provider is required.');
      return;
    }
    if (!model.trim()) {
      setError('Model is required.');
      return;
    }
    setError(null);
    onCreate(trimmedRole, provider.trim(), model.trim(), systemPrompt.trim() || undefined);
  }

  return (
    <div className="max-w-[800px]">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New Agent</h2>
          <Button variant="ghost" size="icon" onClick={onCancel}><X size={16} /></Button>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Role name</label>
              <input
                value={role}
                onChange={(e) => { setRole(e.target.value); setError(null); }}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                placeholder="e.g. reviewer"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Provider</label>
              <ProviderSelect value={provider} onChange={(v) => { setProvider(v); setModel(''); }} />
            </div>
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Model</label>
              <ModelSelect key={provider} provider={provider} value={model} onChange={setModel} />
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">System prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none resize-y min-h-[100px] font-mono"
              placeholder="Optional system prompt for this agent…"
              rows={4}
            />
          </div>

          {error && (
            <div className="text-sm text-err">{error}</div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="accent"
              size="sm"
              onClick={handleCreate}
              disabled={isCreating || role.trim().length === 0 || provider.trim().length === 0 || model.trim().length === 0}
            >
              <Plus size={14} />{isCreating ? 'Creating…' : 'Create Agent'}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
