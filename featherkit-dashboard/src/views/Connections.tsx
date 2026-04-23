import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Tabs, type TabDef } from '@/components/ui/Tabs';
import { Card, MotionCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Dot } from '@/components/ui/Dot';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Sparkles, Zap, Rocket, Plug, RefreshCw, Settings as SettingsIcon, ExternalLink, AlertTriangle, Plus, Edit, Trash2, Server, Code2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { fadeUp, stagger, staggerItem } from '@/lib/motion';
import { apiGet, apiPost } from '@/lib/api';
import { FK_DATA } from '@/data/mock';

type ProviderStatus = 'connected' | 'unauthenticated' | 'expired' | 'error';

type ProviderConnection = {
  provider: string;
  label: string;
  authType: 'cli' | 'pi';
  status: ProviderStatus;
  connected: boolean;
  installed: boolean;
  models: string[];
  usedByRoles: string[];
  warning?: string;
};

type ConnectionsResponse = {
  mcpServers: Record<string, { command?: string; args?: string[]; transport?: string }>;
  providers: Array<{ provider: string; connected: boolean }>;
};

type LoginResponse = {
  type: 'cli' | 'pending';
  instruction?: string;
};

type ProvidersQueryResult = {
  data?: { providers: ProviderConnection[] };
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
};

export function ConnectionsView() {
  const [sub, setSub] = useState('providers');
  const providersQuery = useQuery({
    queryKey: ['connections/providers'],
    queryFn: () => apiGet<{ providers: ProviderConnection[] }>('/api/connections/providers'),
    refetchInterval: false,
    staleTime: 2_000,
  });
  const connectionsQuery = useQuery({
    queryKey: ['connections'],
    queryFn: () => apiGet<ConnectionsResponse>('/api/connections'),
    staleTime: 10_000,
  });

  const tabs: TabDef[] = [
    { id: 'providers', label: 'Model providers', count: providersQuery.data?.providers.length ?? 0 },
    { id: 'mcp', label: 'MCP servers', count: Object.keys(connectionsQuery.data?.mcpServers ?? {}).length },
    { id: 'skills', label: 'Skills', count: FK_DATA.skills.filter(s => s.installed).length },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface/40">
        <SectionLabel className="mb-1">Integrations</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight mb-4">Connections</h1>
        <Tabs tabs={tabs} active={sub} onChange={setSub} />
      </div>
      <motion.div
        key={sub}
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="flex-1 overflow-y-auto fk-scroll p-8"
      >
        {sub === 'providers' && <Providers providersQuery={providersQuery} />}
        {sub === 'mcp' && <McpServers mcpServers={connectionsQuery.data?.mcpServers ?? {}} />}
        {sub === 'skills' && <Skills />}
      </motion.div>
    </div>
  );
}

const providerIcon: Record<string, any> = {
  anthropic: Sparkles,
  'openai-codex': Zap,
  'github-copilot': Code2,
  'gemini-cli': Zap,
  antigravity: Rocket,
};

function Providers({
  providersQuery,
}: {
  providersQuery: ProvidersQueryResult;
}) {
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [polling, setPolling] = useState<{ provider: string; startedAt: number } | null>(null);
  const [pendingLogin, setPendingLogin] = useState<string | null>(null);

  const providers = providersQuery.data?.providers ?? [];
  const activePollingProvider = useMemo(
    () => (polling ? providers.find((provider) => provider.provider === polling.provider) ?? null : null),
    [polling, providers],
  );

  useEffect(() => {
    if (!polling) {
      return;
    }

    if (activePollingProvider?.connected) {
      setPolling(null);
      return;
    }

    if (Date.now() - polling.startedAt > 60_000) {
      setPolling(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void providersQuery.refetch();
    }, 2_000);

    return () => window.clearTimeout(timer);
  }, [activePollingProvider?.connected, polling, providersQuery]);

  const loginMutation = useMutation({
    mutationFn: async (provider: string) => {
      setPendingLogin(provider);
      return apiPost<LoginResponse>(`/api/connections/providers/${encodeURIComponent(provider)}/login`);
    },
    onSuccess: async (response, provider) => {
      const instruction = response.instruction;
      if (instruction) {
        setInstructions((current) => ({ ...current, [provider]: instruction }));
      }

      if (provider !== 'anthropic') {
        setPolling({ provider, startedAt: Date.now() });
      }

      await providersQuery.refetch();
    },
    onSettled: () => {
      setPendingLogin(null);
    },
  });

  const statusTone = (status: ProviderStatus): 'ok' | 'warn' | 'err' => {
    if (status === 'connected') return 'ok';
    if (status === 'error') return 'err';
    return 'warn';
  };

  if (providersQuery.isLoading) {
    return <Card className="p-6 text-sm text-ink-4">Loading provider connections…</Card>;
  }

  if (providersQuery.error) {
    return <Card className="p-6 text-sm text-err">{providersQuery.error.message}</Card>;
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={stagger(0.1)}
      className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-[1100px] items-stretch"
    >
      {providers.map((c) => {
        const connected = c.connected;
        const expired = c.status === 'expired';
        const Icon = providerIcon[c.provider] || Plug;
        const tone = statusTone(c.status);
        const authLabel = c.authType === 'cli' ? 'Claude CLI' : 'Pi OAuth';
        const isThisPending = pendingLogin === c.provider;
        return (
          <motion.div key={c.provider} variants={staggerItem} className="flex">
            <MotionCard className="p-5 hover:border-border-light transition-colors flex flex-col w-full">
              <div className="flex items-start gap-4 mb-4">
                <div className={cn('w-11 h-11 rounded-lg flex items-center justify-center shrink-0',
                  connected ? 'bg-ok/10 text-ok' : expired ? 'bg-warn/10 text-warn' : c.status === 'error' ? 'bg-err/10 text-err' : 'bg-white/[.04] text-ink-4')}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-semibold">{c.label}</div>
                  <div className="text-sm text-ink-4 font-mono">{c.provider}</div>
                </div>
                <Badge tone={tone} className="uppercase">
                  <Dot tone={tone} size={5} pulse={connected} />
                  {c.status.replace('-', ' ')}
                </Badge>
              </div>

              {c.warning && (
                <div className="mb-4 text-sm text-warn bg-warn/5 border border-warn/20 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{c.warning}</span>
                </div>
              )}

              {instructions[c.provider] && (
                <div className="mb-4 text-sm text-accent bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 flex items-start gap-2">
                  <ExternalLink size={13} className="mt-0.5 shrink-0" />
                  <span>{instructions[c.provider]}</span>
                </div>
              )}

              <div className="space-y-2.5 text-sm mb-5">
                <div className="flex justify-between"><span className="text-ink-4">Auth</span><span className="font-mono text-ink-2">{authLabel}</span></div>
                <div className="flex justify-between"><span className="text-ink-4">Install</span><span className="font-mono text-ink-2">{c.installed ? 'available' : 'missing'}</span></div>
                <div className="flex justify-between"><span className="text-ink-4">Models</span><span className="font-mono text-ink-2">{c.models.length > 0 ? `${c.models.length} available` : '—'}</span></div>
              </div>

              {c.models.length > 0 && (
                <div className="mb-5 flex flex-wrap gap-1.5">
                  {c.models.slice(0, 3).map(m => <Badge key={m} tone="default">{m}</Badge>)}
                  {c.models.length > 3 && <Badge tone="muted">+{c.models.length - 3}</Badge>}
                </div>
              )}

              {c.usedByRoles.length > 0 && (
                <div className="mb-5 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-ink-5 uppercase tracking-wider mr-1">Used by</span>
                  {c.usedByRoles.map(r => <Badge key={r} tone={r as any}>{r}</Badge>)}
                </div>
              )}

              <div className="flex gap-2 mt-auto pt-2">
                {connected ? (
                  <>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => void providersQuery.refetch()}><RefreshCw size={13} />Refresh</Button>
                    <Button variant="ghost" size="sm"><SettingsIcon size={13} /></Button>
                  </>
                ) : expired ? (
                  <Button
                    variant="accent"
                    size="sm"
                    className="flex-1"
                    onClick={() => loginMutation.mutate(c.provider)}
                    disabled={isThisPending}
                  >
                    <RefreshCw size={13} />Reconnect
                  </Button>
                ) : (
                  <Button
                    variant="accent"
                    size="sm"
                    className="flex-1"
                    onClick={() => loginMutation.mutate(c.provider)}
                    disabled={isThisPending}
                  >
                    <ExternalLink size={13} />{c.provider === 'anthropic' ? 'Show CLI login' : 'Login'}
                  </Button>
                )}
              </div>
            </MotionCard>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function McpServers({
  mcpServers,
}: {
  mcpServers: Record<string, { command?: string; args?: string[]; transport?: string }>;
}) {
  const rows = Object.entries(mcpServers).map(([name, config]) => ({
    name,
    command: config.command ?? '—',
    args: config.args ?? [],
    transport: config.transport ?? 'stdio',
    status: 'reachable' as const,
    tools: '—',
  }));

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-ink-3 max-w-lg">MCP servers extend agents with tools. FeatherKit proxies them through the orchestrator.</p>
        <Button variant="accent" size="sm"><Plus size={13} />Add server</Button>
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[180px_minmax(240px,1fr)_90px_80px_90px_90px] px-5 py-2.5 text-xs text-ink-5 uppercase tracking-wider border-b border-border bg-elevated/50 min-w-[800px]">
            <span>Name</span><span>Command</span><span>Transport</span><span>Tools</span><span>Status</span><span></span>
          </div>
          <motion.div initial="initial" animate="animate" variants={stagger(0.05)}>
            {rows.map(s => (
              <motion.div
                key={s.name}
                variants={staggerItem}
                className="grid grid-cols-[180px_minmax(240px,1fr)_90px_80px_90px_90px] px-5 py-3.5 items-center hover:bg-white/[.02] transition-colors border-b border-border/50 last:border-b-0 min-w-[800px]"
              >
                <span className="flex items-center gap-2.5">
                  <div className={cn('w-7 h-7 rounded flex items-center justify-center',
                    s.status === 'reachable' ? 'bg-ok/10 text-ok' : 'bg-err/10 text-err')}>
                    <Server size={13} />
                  </div>
                  <span className="text-sm font-medium">{s.name}</span>
                </span>
                <span className="font-mono text-sm text-ink-3 truncate">{s.command} {s.args.join(' ')}</span>
                <Badge tone="muted" className="uppercase justify-self-start">{s.transport}</Badge>
                <span className="text-sm font-mono text-ink-2">{s.tools}</span>
                <Badge tone={s.status === 'reachable' ? 'ok' : 'err'} className="justify-self-start normal-case">
                  <Dot tone={s.status === 'reachable' ? 'ok' : 'err'} size={4} pulse={s.status === 'reachable'} />
                  {s.status === 'reachable' ? 'Online' : 'Down'}
                </Badge>
                <span className="flex gap-1 justify-end">
                  <button className="text-ink-4 hover:text-accent p-1 transition-colors"><Zap size={13} /></button>
                  <button className="text-ink-4 hover:text-ink p-1 transition-colors"><Edit size={13} /></button>
                  <button className="text-ink-4 hover:text-err p-1 transition-colors"><Trash2 size={13} /></button>
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Card>
    </div>
  );
}

function Skills() {
  // TODO: dash-e — Skills tab is still mock data, wire to real registry later
  const [tab, setTab] = useState<'installed' | 'registry'>('installed');
  const list = tab === 'installed' ? FK_DATA.skills.filter(s => s.installed) : FK_DATA.skills.filter(s => !s.installed);
  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-ink-3 max-w-lg">Skills are reusable agent behaviors installed from the community registry.</p>
        <div className="flex gap-1.5">
          {(['installed', 'registry'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 text-sm rounded-lg border capitalize transition-all duration-200',
                tab === t ? 'bg-white/[.05] text-ink border-border-light' : 'border-border text-ink-4 hover:text-ink-2',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <motion.div
        key={tab}
        initial="initial"
        animate="animate"
        variants={stagger(0.08)}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {list.map(sk => (
          <motion.div key={sk.id} variants={staggerItem}>
            <MotionCard className="p-5 hover:border-border-light transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent-dim text-accent flex items-center justify-center shrink-0">
                  <Sparkles size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base font-semibold">{sk.name}</span>
                    <span className="text-xs font-mono text-ink-5">v{sk.version}</span>
                  </div>
                  <div className="text-xs text-ink-4 font-mono mb-1.5">{sk.author}</div>
                  <div className="text-sm text-ink-3 leading-snug">{sk.desc}</div>
                  <div className="mt-3 flex items-center gap-2.5">
                    {sk.installed ? (
                      <>
                        <Toggle checked={sk.enabled} onChange={() => {}} />
                        <span className="text-sm text-ink-4">{sk.enabled ? 'Enabled' : 'Disabled'}</span>
                        <button className="ml-auto text-sm text-ink-4 hover:text-err transition-colors">Uninstall</button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm"><Plus size={13} />Install</Button>
                    )}
                  </div>
                </div>
              </div>
            </MotionCard>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
