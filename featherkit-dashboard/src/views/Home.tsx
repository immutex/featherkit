import { useMemo } from 'react';
import { Card, MotionCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Dot } from '@/components/ui/Dot';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/SectionLabel';
import type { TaskEntry, Role, Phase, Project } from '@/data/mock';
import type { TabId } from '@/components/Sidebar';
import { cn } from '@/lib/cn';
import { BUILTIN_AGENTS, getBuiltInAgentByRole, getModelForRole } from '@/lib/builtin-agents';
import { USE_MOCK } from '@/lib/env';
import { motion } from 'framer-motion';
import { stagger, staggerItem } from '@/lib/motion';
import { useAgentsQuery, useDashboardProjects, useStateQuery } from '@/lib/queries';
import { useEventStore } from '@/store/events';
import {
  Pause, Square, ArrowRight, CheckCircle2, Clock,
  Activity, MessageCircle, AlertTriangle, Zap,
  Layers, Boxes, Eye, GitMerge,
  Terminal, Cpu, GitBranch, Folder,
  XCircle, Loader2, MinusCircle, Sparkles,
  ChevronRight, Radio,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared role metadata
// ---------------------------------------------------------------------------

const roleIcon: Record<Role, typeof Layers> = {
  frame: Layers, build: Boxes, critic: Eye, sync: GitMerge,
};

const roleColorClass: Record<Role, { text: string; bg: string; border: string; stripe: string }> = {
  frame:  { text: 'text-role-frame',  bg: 'bg-role-frame/10',  border: 'border-role-frame/30',  stripe: 'bg-role-frame' },
  build:  { text: 'text-role-build',  bg: 'bg-role-build/10',  border: 'border-role-build/30',  stripe: 'bg-role-build' },
  critic: { text: 'text-role-critic', bg: 'bg-role-critic/10', border: 'border-role-critic/30', stripe: 'bg-role-critic' },
  sync:   { text: 'text-role-sync',   bg: 'bg-role-sync/10',   border: 'border-role-sync/30',   stripe: 'bg-role-sync' },
};

const PHASES: Phase[] = ['frame', 'build', 'critic', 'sync'];

function buildTrend(value: number, minimum = 0): number[] {
  return Array.from({ length: 12 }, (_, index) => Math.max(minimum, value - (11 - index)));
}

// ---------------------------------------------------------------------------
// Main Home view — full-width mission control grid
// ---------------------------------------------------------------------------

export function HomeView({ onNav }: { onNav: (t: TabId) => void }) {
  const { data: state } = useStateQuery();
  const projects = useDashboardProjects();
  const events = useEventStore((store) => store.events);
  const tasks = useMemo(() => projects.flatMap((project) => project.tasks), [projects]);
  const activeTask = tasks.find(t => t.status === 'active' && !t.waitingForInput)
                 ?? tasks.find(t => t.status === 'active')
                 ?? tasks[0];

  const allPendingInputs = projects.flatMap(p => p.pendingInputs.map(inp => ({ ...inp, projectName: p.name, projectId: p.id })));
  const activeTasks = tasks.filter(t => t.status === 'active');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div className="h-full overflow-y-auto fk-scroll bg-bg">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 border-b border-border bg-surface/40 sticky top-0 z-20 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel className="mb-1">Mission Control</SectionLabel>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          </div>
          <OrchestratorChip status={state?.orchestrator?.status ?? 'idle'} pid={state?.orchestrator?.pid} />
        </div>
      </div>

      <motion.div
        initial="initial"
        animate="animate"
        variants={stagger(0.05)}
        className="px-8 py-6 space-y-4"
      >
        {/* Pending input alert */}
        {allPendingInputs.length > 0 && (
          <motion.div variants={staggerItem}>
            <PendingInputAlert
              count={allPendingInputs.length}
              first={allPendingInputs[0]}
              onClick={() => onNav('projects')}
            />
          </motion.div>
        )}

        {/* Hero: Active Run — full width */}
        <motion.div variants={staggerItem}>
          {activeTask ? <ActiveRunHero task={activeTask} projects={projects} /> : <EmptyHero />}
        </motion.div>

        {/* Stat tiles — 4 equal columns, full width */}
        <motion.div variants={staggerItem} className="grid grid-cols-4 gap-4">
          <StatTile
            label="Active"
            value={activeTasks.length}
            icon={Zap}
            color="#22d3ee"
            trend={buildTrend(activeTasks.length)}
            delta={+1}
          />
          <StatTile
            label="Pending"
            value={pendingTasks.length}
            icon={Clock}
            color="#a1a1aa"
            trend={buildTrend(pendingTasks.length)}
            delta={-1}
          />
          <StatTile
            label="Blocked"
            value={blockedTasks.length}
            icon={AlertTriangle}
            color="#f87171"
            trend={buildTrend(blockedTasks.length)}
            delta={0}
          />
          <StatTile
            label="Completed"
            value={doneTasks.length}
            icon={CheckCircle2}
            color="#4ade80"
            trend={buildTrend(doneTasks.length)}
            delta={+2}
          />
        </motion.div>

        {/* Row: Event stream + Projects */}
        <motion.div variants={staggerItem} className="grid grid-cols-12 gap-4">
          <div className="col-span-7">
            <EventStream events={events} onNav={onNav} />
          </div>
          <div className="col-span-5">
            <ProjectsPanel projects={projects} onNav={onNav} />
          </div>
        </motion.div>

        {/* Row: Queue + Agent roster */}
        <motion.div variants={staggerItem} className="grid grid-cols-12 gap-4">
          <div className="col-span-7">
            <TaskQueue tasks={[...activeTasks, ...pendingTasks]} onNav={onNav} />
          </div>
          <div className="col-span-5">
            <AgentRoster />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orchestrator chip (header)
// ---------------------------------------------------------------------------

function OrchestratorChip({ status, pid }: { status: string; pid?: number }) {
  const isRunning = status === 'running';
  return (
    <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-elevated border border-border">
      <div className="relative flex h-2 w-2">
        {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-60" />}
        <span className={cn('relative inline-flex rounded-full h-2 w-2', isRunning ? 'bg-ok' : 'bg-ink-5')} />
      </div>
      <div className="text-[11px] font-mono text-ink-3">
        <span className="text-ink">orchestrator</span>
        <span className="text-ink-5 mx-1.5">·</span>
        <span className="text-ink-4">{status}</span>
        {pid && (
          <>
            <span className="text-ink-5 mx-1.5">·</span>
            <span className="text-ink-4">pid {pid}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending input alert
// ---------------------------------------------------------------------------

function PendingInputAlert({ count, first, onClick }: { count: number; first: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left block">
      <Card className="relative overflow-hidden p-4 border-warn/30 bg-warn/[0.04] hover:border-warn/50 transition-colors flex items-center gap-4">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-warn" />
        <div className="relative flex h-3 w-3 shrink-0 ml-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warn opacity-70" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-warn" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-warn">
              {count > 1 ? `${count} agents waiting for input` : 'Agent needs input'}
            </span>
            <Badge tone="warn" className="text-[10px]">{first.agentName}</Badge>
          </div>
          <div className="text-sm text-ink-3 mt-0.5 truncate">
            {first.taskTitle} — <span className="text-ink-4">{first.question}</span>
          </div>
        </div>
        <ChevronRight size={16} className="text-warn shrink-0" />
      </Card>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Active Run Hero — full-width, 3-section layout
// ---------------------------------------------------------------------------

function EmptyHero() {
  return (
    <MotionCard className="p-6">
      <div className="text-sm font-medium text-ink">No active tasks yet</div>
      <div className="mt-1 text-sm text-ink-4">Start a task from the Projects view to see live state here.</div>
    </MotionCard>
  );
}

function ActiveRunHero({ task, projects }: { task: TaskEntry; projects: Project[] }) {
  const role = task.role ?? 'build';
  const agent = getBuiltInAgentByRole(role);
  const project = projects.find(p => p.tasks.some(t => t.id === task.id));

  return (
    <MotionCard className="relative overflow-hidden">
      {/* Ambient gradient — role-tinted */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(34,211,238,0.06), transparent 60%),
                     radial-gradient(ellipse 60% 80% at 100% 100%, rgba(74,222,128,0.04), transparent 60%)`,
      }} />

      <div className="relative grid grid-cols-12 gap-6 p-5">
        {/* Left: task meta + phase timeline + verification pills */}
        <div className="col-span-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-mono text-ink-5 px-1.5 py-0.5 rounded bg-bg border border-border">
              <Radio size={9} className="text-ok animate-pulse" />LIVE
            </span>
            <span className="text-[11px] font-mono text-ink-4">{task.id}</span>
            {project && (
              <>
                <span className="text-ink-5">·</span>
                <span className="text-[11px] font-mono text-ink-4 flex items-center gap-1">
                  <Folder size={10} />{project.name}
                </span>
              </>
            )}
          </div>

          <h2 className="text-[22px] font-semibold tracking-tight leading-tight mb-1">
            {task.title}
          </h2>
          <div className="text-sm text-ink-4 mb-5">
            Orchestrating a full frame → build → critic → sync cycle.
          </div>

          {/* Phase Timeline */}
          <PhaseTimeline current={task.phase ?? 'build'} />

          {/* Verification pills */}
          <div className="mt-5">
            <div className="text-[10.5px] font-mono text-ink-5 uppercase tracking-wider mb-2">Gates</div>
            <div className="flex flex-wrap gap-1.5">
              <CheckPill label="typecheck" status="pass" duration="3.2s" />
              <CheckPill label="test" status="running" />
              <CheckPill label="lint" status="skipped" />
              <CheckPill label="build" status="pass" duration="12.0s" />
            </div>
          </div>
        </div>

        {/* Middle: terminal stream */}
        <div className="col-span-4">
          <TerminalTail
            agent={agent?.name ?? 'Build'}
            role={role}
            lines={[
              'orchestrator ▸ spawning claude --print (pid 48231)',
              'claude:build ▸ reading src/orchestrator/router.ts',
              'claude:build ▸ applying changes to 3 files',
              'claude:build ▸ compiling with tsc --noEmit',
              task.progress ?? 'waiting for next line…',
            ]}
          />
        </div>

        {/* Right: agent info + actions */}
        <div className="col-span-3 flex flex-col justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-mono text-ink-5 uppercase tracking-wider mb-2">Current Agent</div>
            {agent && <AgentBadge role={role} agent={agent} />}
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="px-2.5 py-1.5 rounded-md bg-bg border border-border">
                <div className="text-ink-5">elapsed</div>
                <div className="text-ink mt-0.5 tabular-nums">3:42</div>
              </div>
              <div className="px-2.5 py-1.5 rounded-md bg-bg border border-border">
                <div className="text-ink-5">tokens</div>
                <div className="text-ink mt-0.5 tabular-nums">18.4k</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="md" className="w-full justify-center"><Pause size={13} />Pause</Button>
            <Button variant="danger" size="md" className="w-full justify-center"><Square size={13} />Stop</Button>
          </div>
        </div>
      </div>
    </MotionCard>
  );
}

function AgentBadge({ role, agent }: { role: Role; agent: { name: string; model: string } }) {
  const c = roleColorClass[role];
  const Icon = roleIcon[role];
  return (
    <div className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg border', c.border, c.bg)}>
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', c.bg, 'border', c.border)}>
        <Icon size={15} className={c.text} />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold tracking-tight">{agent.name}</div>
        <div className="text-[10.5px] font-mono text-ink-4 truncate">{agent.model}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase Timeline — horizontal 4-segment progress bar
// ---------------------------------------------------------------------------

function PhaseTimeline({ current }: { current: Phase }) {
  const currentIdx = PHASES.indexOf(current);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {PHASES.map((p, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          const c = roleColorClass[p];
          return (
            <div key={p} className="flex-1 relative">
              <div className="h-[4px] rounded-full bg-border/60 overflow-hidden">
                <motion.div
                  className={cn('h-full rounded-full', isDone ? 'bg-ok' : isActive ? c.stripe : 'bg-transparent')}
                  initial={{ width: 0 }}
                  animate={{ width: isDone ? '100%' : isActive ? '55%' : '0%' }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              {isActive && (
                <motion.div
                  className={cn('absolute top-0 h-[4px] rounded-full', c.stripe)}
                  style={{ width: '25%' }}
                  animate={{ x: ['-100%', '400%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        {PHASES.map((p, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          const c = roleColorClass[p];
          const Icon = roleIcon[p];
          return (
            <div key={p} className="flex-1 flex items-center gap-1.5">
              <Icon size={11} className={cn(isActive ? c.text : isDone ? 'text-ok' : 'text-ink-5')} />
              <span className={cn(
                'text-[11px] font-mono uppercase tracking-wider',
                isActive ? 'text-ink' : isDone ? 'text-ink-3' : 'text-ink-5',
              )}>
                {p}
              </span>
              {isActive && <span className="ml-auto text-[10px] font-mono text-ink-5 animate-pulse">▸</span>}
              {isDone && <CheckCircle2 size={10} className="ml-auto text-ok" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification check pill
// ---------------------------------------------------------------------------

type CheckStatus = 'pass' | 'fail' | 'running' | 'skipped' | 'warn';

function CheckPill({ label, status, duration }: { label: string; status: CheckStatus; duration?: string }) {
  const config = {
    pass:    { cls: 'bg-ok/[0.08] border-ok/30 text-ok', Icon: CheckCircle2 },
    fail:    { cls: 'bg-err/[0.08] border-err/30 text-err', Icon: XCircle },
    running: { cls: 'bg-accent/[0.08] border-accent/30 text-accent', Icon: Loader2 },
    skipped: { cls: 'bg-border/30 border-border text-ink-5', Icon: MinusCircle },
    warn:    { cls: 'bg-warn/[0.08] border-warn/30 text-warn', Icon: AlertTriangle },
  }[status];
  const { cls, Icon } = config;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10.5px] font-mono', cls)}>
      <Icon size={10} className={status === 'running' ? 'animate-spin' : ''} />
      {label}
      {duration && <span className="text-ink-5 ml-1">{duration}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Terminal tail — stylized live output view
// ---------------------------------------------------------------------------

function TerminalTail({ agent, role, lines }: { agent: string; role: Role; lines: string[] }) {
  const c = roleColorClass[role];
  return (
    <div className="h-full rounded-lg bg-bg/70 border border-border overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5 bg-bg/50">
        <div className="w-2 h-2 rounded-full bg-err/50" />
        <div className="w-2 h-2 rounded-full bg-warn/50" />
        <div className="w-2 h-2 rounded-full bg-ok/50" />
        <div className="ml-auto flex items-center gap-1.5">
          <Terminal size={10} className="text-ink-5" />
          <span className="text-[10px] font-mono text-ink-5">{agent} · live</span>
          <span className="w-1 h-1 rounded-full bg-ok animate-pulse ml-1" />
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {/* top fade */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-bg/80 to-transparent pointer-events-none z-10" />
        <div className="p-3 font-mono text-[11px] leading-relaxed text-ink-3 space-y-0.5 h-full overflow-y-auto fk-scroll">
          {lines.map((l, i) => {
            const isLast = i === lines.length - 1;
            const [tag, ...rest] = l.split(' ▸ ');
            const message = rest.join(' ▸ ');
            return (
              <div key={i} className={cn('flex gap-2 items-baseline', isLast && 'text-ink')}>
                <span className={cn('shrink-0', isLast ? c.text : 'text-ink-5')}>▸</span>
                {message ? (
                  <>
                    <span className={cn('shrink-0 opacity-70', isLast ? c.text : 'text-ink-5')}>{tag}</span>
                    <span className="truncate">{message}</span>
                  </>
                ) : (
                  <span className="truncate">{l}</span>
                )}
                {isLast && <span className={cn('shrink-0 animate-pulse', c.text)}>▊</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile — big number + sparkline + delta
// ---------------------------------------------------------------------------

function StatTile({ label, value, icon: Icon, color, trend, delta }: {
  label: string;
  value: number;
  icon: typeof Zap;
  color: string;
  trend: number[];
  delta: number;
}) {
  return (
    <MotionCard className="p-4 relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
            <Icon size={12} style={{ color }} />
          </div>
          <span className="text-[11px] text-ink-4 uppercase tracking-wider">{label}</span>
        </div>
        <span className={cn(
          'text-[10.5px] font-mono px-1.5 py-0.5 rounded border',
          delta > 0 ? 'text-ok border-ok/20 bg-ok/5' :
          delta < 0 ? 'text-err border-err/20 bg-err/5' :
                      'text-ink-5 border-border bg-bg',
        )}>
          {delta > 0 ? '+' : ''}{delta}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-[32px] font-semibold tracking-tight leading-none tabular-nums">{value}</span>
        <Sparkline data={trend} color={color} />
      </div>
    </MotionCard>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const { path, area, max } = useMemo(() => {
    if (data.length < 2) return { path: '', area: '', max: 0 };
    const w = 84, h = 30;
    const mx = Math.max(...data);
    const mn = Math.min(...data);
    const range = mx - mn || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = i * step;
      const y = h - ((v - mn) / range) * (h - 2) - 1;
      return [x, y] as const;
    });
    const path = 'M ' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ');
    const area = path + ` L ${w},${h} L 0,${h} Z`;
    return { path, area, max: mx };
  }, [data]);

  const gid = useMemo(() => `sg-${Math.random().toString(36).slice(2, 9)}`, []);

  return (
    <svg width={84} height={30} className="shrink-0 block">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {max > 0 && (
        <circle
          cx={84}
          cy={30 - ((data[data.length - 1] - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * 28 - 1}
          r={2}
          fill={color}
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Event stream
// ---------------------------------------------------------------------------

const eventKindIcon = {
  phase: Zap,
  orchestrator: Cpu,
  verification: CheckCircle2,
  input: MessageCircle,
  gate: Sparkles,
};

function EventStream({ events, onNav: _ }: { events: Array<{ id: string; ts: string; kind: 'phase' | 'gate' | 'orchestrator' | 'verification' | 'input'; tone: 'info' | 'ok' | 'warn' | 'err' | 'accent'; task?: string; message: string }>; onNav: (t: TabId) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-ink-4" />
          <span className="text-sm font-semibold">Activity</span>
          <span className="w-1 h-1 rounded-full bg-ok animate-pulse ml-1" />
          <span className="text-[10.5px] font-mono text-ink-5">live</span>
        </div>
        <button className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 transition-colors">
          Open log <ArrowRight size={11} />
        </button>
      </div>
      <div className="divide-y divide-border/40 max-h-[360px] overflow-y-auto fk-scroll">
        {events.length === 0 && (
          <div className="px-4 py-6 text-sm text-ink-4">No orchestrator events yet.</div>
        )}
        {events.map(e => {
          const Icon = eventKindIcon[e.kind] ?? Activity;
          const toneColor = {
            ok: 'text-ok', err: 'text-err', warn: 'text-warn',
            info: 'text-info', accent: 'text-accent', muted: 'text-ink-5',
          }[e.tone] ?? 'text-ink-5';
          return (
            <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.015] transition-colors group">
              <span className="text-[10.5px] font-mono text-ink-5 shrink-0 w-12 tabular-nums">{e.ts}</span>
              <div className="w-5 h-5 rounded-md bg-bg border border-border flex items-center justify-center shrink-0">
                <Icon size={10} className={toneColor} />
              </div>
              {e.task && (
                <span className="text-[10.5px] font-mono text-ink-4 px-1.5 py-0.5 rounded bg-bg border border-border shrink-0">
                  {e.task}
                </span>
              )}
              <span className="text-sm text-ink-2 truncate flex-1">{e.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Projects panel
// ---------------------------------------------------------------------------

function ProjectsPanel({ projects, onNav }: { projects: Project[]; onNav: (t: TabId) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Folder size={14} className="text-ink-4" />
          <span className="text-sm font-semibold">Projects</span>
          <span className="text-[10.5px] font-mono text-ink-5">{projects.length}</span>
        </div>
        <button onClick={() => onNav('projects')} className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 transition-colors">
          All <ArrowRight size={11} />
        </button>
      </div>
      <div className="p-3 space-y-2.5">
        {projects.map(p => (
          <ProjectCard key={p.id} project={p} onClick={() => onNav('projects')} />
        ))}
      </div>
    </Card>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const activeCount = project.tasks.filter(t => t.status === 'active').length;
  const blockedCount = project.tasks.filter(t => t.status === 'blocked').length;
  const activeTask = project.tasks.find(t => t.status === 'active');

  const statusTone = project.status === 'active' ? 'ok' : project.status === 'error' ? 'err' : 'muted';

  return (
    <button onClick={onClick} className="w-full text-left block">
      <MotionCard className="p-3.5 hover:border-accent/30 transition-colors relative overflow-hidden">
        {project.status === 'active' && (
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-ok" />
        )}
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{project.name}</span>
              <Badge tone={statusTone as any} className="text-[9.5px]">
                <Dot tone={statusTone as any} size={3} pulse={project.status === 'active'} />
                {project.status}
              </Badge>
            </div>
            <div className="text-[10.5px] font-mono text-ink-5 truncate mt-0.5">{project.path}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10.5px] font-mono text-ink-4">
          <span className="flex items-center gap-1"><GitBranch size={10} />{project.branch}</span>
          <span className="text-ink-5">·</span>
          <span>{project.commit}</span>
          {activeCount > 0 && (
            <>
              <span className="ml-auto text-accent">{activeCount} active</span>
            </>
          )}
          {blockedCount > 0 && (
            <span className="text-err">{blockedCount} blocked</span>
          )}
        </div>

        {activeTask && (
          <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center gap-2 text-[11px]">
            <Badge tone={(activeTask.role ?? 'frame') as any} className="text-[9.5px]">{activeTask.phase}</Badge>
            <span className="text-ink-3 truncate">{activeTask.title}</span>
          </div>
        )}
      </MotionCard>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Task queue
// ---------------------------------------------------------------------------

function TaskQueue({ tasks, onNav }: { tasks: TaskEntry[]; onNav: (t: TabId) => void }) {
  const display = tasks.slice(0, 6);

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-ink-4" />
          <span className="text-sm font-semibold">Queue</span>
          <span className="text-[10.5px] font-mono text-ink-5">{tasks.length}</span>
        </div>
        <button onClick={() => onNav('projects')} className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 transition-colors">
          Open kanban <ArrowRight size={11} />
        </button>
      </div>
      <div className="divide-y divide-border/40">
        {display.map(t => <QueueRow key={t.id} task={t} />)}
        {tasks.length > display.length && (
          <div className="px-4 py-2 text-center text-[11px] font-mono text-ink-5">
            + {tasks.length - display.length} more
          </div>
        )}
      </div>
    </Card>
  );
}

function QueueRow({ task }: { task: TaskEntry }) {
  const role = task.role ?? 'frame';
  const Icon = roleIcon[role];
  const isActive = task.status === 'active';
  const isBlocked = task.status === 'blocked';
  const statusTone = isActive ? 'accent' : isBlocked ? 'err' : task.status === 'done' ? 'ok' : 'muted';

  return (
    <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.015] transition-colors group">
      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', roleColorClass[role].bg, 'border', roleColorClass[role].border)}>
        <Icon size={12} className={roleColorClass[role].text} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-mono text-ink-5">{task.id}</span>
          <span className="text-sm text-ink-2 truncate">{task.title}</span>
          {task.waitingForInput && <MessageCircle size={11} className="text-warn shrink-0" />}
        </div>
        {(task.progress || task.blockReason) && (
          <div className={cn('text-[11px] font-mono truncate mt-0.5', isBlocked ? 'text-err/80' : 'text-ink-5')}>
            {task.progress ?? task.blockReason}
          </div>
        )}
      </div>
      <Badge tone={statusTone as any} className="text-[9.5px] shrink-0">
        <Dot tone={statusTone as any} size={3} pulse={isActive} />
        {task.status}
      </Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent roster — role / model / usage
// ---------------------------------------------------------------------------

function AgentRoster() {
  const agentsQuery = useAgentsQuery();
  const roleAgents = useMemo(() => {
    if (USE_MOCK || agentsQuery.isLoading || agentsQuery.isError || !agentsQuery.data) {
      return BUILTIN_AGENTS;
    }

    return BUILTIN_AGENTS.map((agent) => ({
      ...agent,
      model: getModelForRole(agentsQuery.data.models, agent.roleColor),
    }));
  }, [agentsQuery.data, agentsQuery.isError, agentsQuery.isLoading]);

  // TODO: real metrics
  const usageByRole: Record<string, { tokens: number; budget: number; calls: number }> = {
    frame:  { tokens: 32400, budget: 120000, calls: 18 },
    build:  { tokens: 84200, budget: 200000, calls: 42 },
    critic: { tokens: 12800, budget: 100000, calls: 11 },
    sync:   { tokens:  5400, budget:  80000, calls:  7 },
  };

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-ink-4" />
          <span className="text-sm font-semibold">Agents</span>
          <span className="text-[10.5px] font-mono text-ink-5">today</span>
        </div>
        <span className="text-[10.5px] font-mono text-ink-4">
          {formatTokens(Object.values(usageByRole).reduce((s, u) => s + u.tokens, 0))}
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {roleAgents.map(a => {
          const usage = usageByRole[a.roleColor] ?? { tokens: 0, budget: 1, calls: 0 };
          return (
            <AgentRosterRow
              key={a.id}
              role={a.roleColor as Role}
              name={a.name}
              model={a.model}
              tokens={usage.tokens}
              budget={usage.budget}
              calls={usage.calls}
            />
          );
        })}
      </div>
    </Card>
  );
}

function AgentRosterRow({ role, name, model, tokens, budget, calls }: {
  role: Role; name: string; model: string; tokens: number; budget: number; calls: number;
}) {
  const c = roleColorClass[role];
  const Icon = roleIcon[role];
  const pct = Math.min(100, (tokens / budget) * 100);

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', c.bg, 'border', c.border)}>
        <Icon size={14} className={c.text} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold tracking-tight">{name}</span>
            <span className="text-[10.5px] font-mono text-ink-4 truncate">{model}</span>
          </div>
          <div className="text-[10.5px] font-mono text-ink-4 tabular-nums shrink-0">
            <span className="text-ink-3">{formatTokens(tokens)}</span>
            <span className="text-ink-5"> / {formatTokens(budget)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-border/60 overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', c.stripe)}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[10px] font-mono text-ink-5 shrink-0 tabular-nums">{calls} calls</span>
        </div>
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}
