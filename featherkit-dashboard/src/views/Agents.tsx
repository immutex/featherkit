import { useMemo, useState } from 'react';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { MotionCard, Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { type ApiModelConfig, useAgentsQuery, useUpdateAgents } from '@/lib/queries';
import { motion, AnimatePresence } from 'framer-motion';
import { stagger, staggerItem, fadeUp } from '@/lib/motion';
import { Bot, Save, X } from 'lucide-react';

type AgentConfig = {
  id: string;
  name: string;
  role: string;
  roleColor: string;
  provider: string;
  model: string;
};

const ROLE_ORDER = ['frame', 'build', 'critic', 'sync'];

function roleLabel(role: string): string {
  return role[0]?.toUpperCase() + role.slice(1) || role;
}

function toAgentConfig(model: ApiModelConfig): AgentConfig {
  return {
    id: model.role,
    name: roleLabel(model.role),
    role: model.role,
    roleColor: model.role,
    provider: model.provider,
    model: model.model,
  };
}

export function AgentsView() {
  const agentsQuery = useAgentsQuery();
  const updateAgents = useUpdateAgents();
  const [editing, setEditing] = useState<string | null>(null);
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
          ? { role: agent.role, provider: agent.provider, model: agent.model }
          : model,
      ),
    });
    setEditing(null);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface/40">
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel className="mb-1">Configuration</SectionLabel>
            <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
          </div>
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
                    onEdit={() => setEditing(agent.id)}
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

function AgentCard({ agent, onEdit }: { agent: AgentConfig; onEdit: () => void }) {
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
          <Badge tone="muted">{agent.role}</Badge>
        </div>

        <div className="space-y-3 text-sm mb-4">
          <div>
            <div className="text-xs text-ink-5 uppercase tracking-wider mb-1">Provider</div>
            <div className="text-ink-2 font-medium">{agent.provider}</div>
          </div>
          <div>
            <div className="text-xs text-ink-5 uppercase tracking-wider mb-1">Model</div>
            <div className="text-ink-3 font-mono break-all">{agent.model}</div>
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>Edit</Button>
      </div>
    </MotionCard>
  );
}

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

  function handleSave() {
    if (!agent) {
      return;
    }

    onSave({
      ...agent,
      provider: provider.trim(),
      model: model.trim(),
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
              <input
                value={provider}
                onChange={e => setProvider(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                placeholder="anthropic"
              />
            </div>
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Model</label>
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink font-mono focus:border-accent focus:outline-none"
                placeholder="claude-sonnet-4-6"
              />
            </div>
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
