import { useState, useRef, useEffect } from 'react';
import type { Project, TaskEntry } from '@/data/mock';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Tabs, type TabDef } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Dot } from '@/components/ui/Dot';
import { Card, MotionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PhaseDots } from '@/components/ui/PhaseDots';
import { cn } from '@/lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeUp, stagger, staggerItem } from '@/lib/motion';
import { KanbanBoard } from './Kanban';
import { WorkflowCanvas } from './Workflow';
import { useDashboardProjects, useRunVerification, useVerificationQuery } from '@/lib/queries';
import { GitBranch, GitCommit, Folder, Play, Filter, List, LayoutGrid, MessageCircle, Send, Sparkles, CornerDownLeft, Bot } from 'lucide-react';

export function ProjectsView({
  selectedProject,
  onToast,
}: {
  selectedProject: string;
  onToast: (toast: { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string }) => void;
}) {
  const projects = useDashboardProjects();
  const project = projects.find(p => p.id === selectedProject) || projects[0];
  const [sub, setSub] = useState('tasks');

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-4">
        Waiting for workspace state…
      </div>
    );
  }

  const subs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks', count: project.tasks.length },
    { id: 'chat', label: 'Chat', notify: project.pendingInputs.length > 0 },
    { id: 'workflow', label: 'Workflow' },
    { id: 'verification', label: 'Verification' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface/40">
        <div className="flex items-center justify-between mb-4">
          <div>
            <SectionLabel className="mb-1">Project</SectionLabel>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
              <Badge tone={project.status === 'active' ? 'ok' : 'muted'}>
                <Dot tone={project.status === 'active' ? 'ok' : 'muted'} size={4} pulse={project.status === 'active'} />
                {project.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-ink-4 font-mono">
              <span className="flex items-center gap-1.5"><Folder size={13} /> {project.path}</span>
              <span className="flex items-center gap-1.5"><GitBranch size={13} /> {project.branch}</span>
              <span className="flex items-center gap-1.5"><GitCommit size={13} /> {project.commit}</span>
            </div>
          </div>
          <Button variant="accent" size="sm"><Play size={14} />Run orchestrator</Button>
        </div>
        <Tabs tabs={subs} active={sub} onChange={setSub} />
      </div>

      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={sub}
            variants={fadeUp}
            initial="initial"
            animate="animate"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className={cn('h-full', sub === 'chat' ? '' : 'overflow-y-auto fk-scroll p-8')}
          >
            {sub === 'overview' && <Overview project={project} />}
            {sub === 'tasks' && <TasksSection tasks={project.tasks} onToast={onToast} />}
            {sub === 'chat' && <ChatPanel project={project} />}
            {sub === 'workflow' && <WorkflowCanvas onToast={onToast} />}
            {sub === 'verification' && <VerificationConfig project={project} />}
            {sub === 'history' && <HistoryTimeline />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

type ChatMessage = {
  id: string;
  role: 'agent' | 'user' | 'system';
  agentName?: string;
  agentColor?: string;
  content: string;
  timestamp: string;
  taskId?: string;
};

function ChatPanel({ project }: { project: Project }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial: ChatMessage[] = [
      { id: 'sys-1', role: 'system', content: 'Orchestrator started. Frame phase running on orch-f2.', timestamp: '10:38:00' },
    ];
    project.pendingInputs.forEach(inp => {
      const options = inp.options ?? [];
      const body = options.length
        ? `${inp.question}\n\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nOr type your own answer.`
        : inp.question;
      initial.push({
        id: inp.id,
        role: 'agent',
        agentName: inp.agentName,
        agentColor: inp.agentId === 'agent-frame' ? 'frame' : inp.agentId === 'agent-build' ? 'build' : inp.agentId === 'agent-critic' ? 'critic' : 'sync',
        content: body,
        timestamp: inp.timestamp,
        taskId: inp.taskId,
      });
    });
    return initial;
  });
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    if (!input.trim()) return;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    };
    setMessages(m => [...m, userMsg]);
    setInput('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto fk-scroll px-8 py-6 space-y-1">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-8 py-4 bg-surface/60">
        <div className="flex items-end gap-3 max-w-[900px] mx-auto">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-ink resize-none focus:border-accent focus:outline-none min-h-[44px] max-h-[160px] pr-10"
              placeholder="Message the orchestrator…"
              rows={1}
            />
            <div className="absolute right-3 bottom-2.5 text-ink-5 flex items-center gap-1 text-xs">
              <CornerDownLeft size={11} />
            </div>
          </div>
          <Button variant="accent" size="sm" onClick={handleSend} className="h-[44px] px-4">
            <Send size={14} />Send
          </Button>
        </div>
        <p className="text-xs text-ink-5 text-center mt-2">
          Messages are routed by the orchestrator to the appropriate agent.
        </p>
      </div>
    </div>
  );
}

const agentColorMap: Record<string, string> = {
  frame: 'text-role-frame',
  build: 'text-role-build',
  critic: 'text-role-critic',
  sync: 'text-role-sync',
};

const agentBorderMap: Record<string, string> = {
  frame: 'border-l-role-frame/40',
  build: 'border-l-role-build/40',
  critic: 'border-l-role-critic/40',
  sync: 'border-l-role-sync/40',
};

const agentBgMap: Record<string, string> = {
  frame: 'bg-role-frame/5',
  build: 'bg-role-build/5',
  critic: 'bg-role-critic/5',
  sync: 'bg-role-sync/5',
};

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-ink-5 bg-elevated px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    );
  }

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end py-1">
        <div className="max-w-[70%] bg-accent/10 border border-accent/20 rounded-2xl rounded-br-md px-4 py-3">
          <p className="text-sm text-ink leading-snug whitespace-pre-wrap">{msg.content}</p>
          <span className="text-xs text-ink-5 mt-1 block text-right">{msg.timestamp}</span>
        </div>
      </div>
    );
  }

  const color = msg.agentColor || 'accent';
  return (
    <div className="flex justify-start py-1">
      <div className={cn('max-w-[75%] border-l-2 rounded-2xl rounded-bl-md px-4 py-3', agentBorderMap[color] || 'border-l-accent/40', agentBgMap[color] || 'bg-elevated')}>
        <div className="flex items-center gap-2 mb-1.5">
          <Bot size={13} className={agentColorMap[color] || 'text-accent'} />
          <span className={cn('text-sm font-medium', agentColorMap[color] || 'text-accent')}>{msg.agentName}</span>
          {msg.taskId && <span className="text-xs text-ink-5 font-mono">{msg.taskId}</span>}
          <span className="text-xs text-ink-5 ml-auto">{msg.timestamp}</span>
        </div>
        <p className="text-sm text-ink-2 leading-snug whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

function Overview({ project }: { project: Project }) {
  const done = project.tasks.filter(t => t.status === 'done').length;
  const pct = Math.round((done / project.tasks.length) * 100);
  return (
    <motion.div initial="initial" animate="animate" variants={stagger(0.1)} className="max-w-[1100px] space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Progress', value: `${pct}%`, extra: <div className="mt-3 h-2.5 rounded-full bg-white/[.04] overflow-hidden"><motion.div className="h-full bg-accent rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} /></div> },
          { label: 'Throughput', value: '3.2', extra: <span className="text-sm text-ink-4 font-normal">tasks/day</span> },
          { label: 'Avg cycle', value: '14', extra: <span className="text-sm text-ink-4 font-normal">m</span> },
        ].map(s => (
          <motion.div key={s.label} variants={staggerItem}>
            <MotionCard className="p-5">
              <div className="text-xs text-ink-4 uppercase tracking-wider mb-3">{s.label}</div>
              <div className="text-3xl font-semibold">{s.value} {s.extra}</div>
            </MotionCard>
          </motion.div>
        ))}
      </div>

      <motion.div variants={staggerItem}>
        <Card className="p-5">
          <div className="text-sm font-semibold mb-4">Phase durations</div>
          <div className="space-y-3">
            {[
              { name: 'frame', pct: 18, color: 'bg-role-frame' },
              { name: 'build', pct: 52, color: 'bg-role-build' },
              { name: 'critic', pct: 22, color: 'bg-role-critic' },
              { name: 'sync', pct: 8, color: 'bg-role-sync' },
            ].map(p => (
              <div key={p.name} className="flex items-center gap-4">
                <span className="text-sm font-mono text-ink-3 w-16 capitalize">{p.name}</span>
                <div className="flex-1 h-2.5 rounded-full bg-white/[.04] overflow-hidden">
                  <motion.div className={cn('h-full rounded-full', p.color)} initial={{ width: 0 }} animate={{ width: `${p.pct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }} />
                </div>
                <span className="text-sm font-mono text-ink-4 w-12 text-right">{p.pct}%</span>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function TasksSection({ tasks, onToast }: { tasks: TaskEntry[]; onToast: (toast: { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string }) => void }) {
  const [view, setView] = useState<'list' | 'kanban'>('list');

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setView('list')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors', view === 'list' ? 'bg-white/[.05] text-ink' : 'text-ink-4 hover:text-ink-2')}
          >
            <List size={14} />List
          </button>
          <button
            onClick={() => setView('kanban')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors', view === 'kanban' ? 'bg-white/[.05] text-ink' : 'text-ink-4 hover:text-ink-2')}
          >
            <LayoutGrid size={14} />Kanban
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <TasksList tasks={tasks} />
          </motion.div>
        ) : (
          <motion.div key="kanban" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <KanbanBoard tasks={tasks} onToast={onToast} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TasksList({ tasks }: { tasks: TaskEntry[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'blocked' | 'pending' | 'done'>('all');
  const list = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  return (
    <div className="max-w-[1200px]">
      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-ink-5" />
        {(['all', 'active', 'blocked', 'pending', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm border transition-all duration-200 capitalize',
              filter === f ? 'bg-white/[.05] text-ink border-border-light' : 'border-border text-ink-4 hover:text-ink-2',
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[110px_1fr_100px_120px_100px_90px] px-5 py-2.5 text-xs text-ink-5 uppercase tracking-wider border-b border-border bg-elevated/50">
          <span>ID</span><span>Title</span><span>Status</span><span>Phase</span><span>Role</span><span>Updated</span>
        </div>
        <motion.div initial="initial" animate="animate" variants={stagger(0.03)}>
          {list.map(t => (
            <motion.div
              key={t.id}
              variants={staggerItem}
              className="grid grid-cols-[110px_1fr_100px_120px_100px_90px] px-5 py-3 items-center hover:bg-white/[.02] transition-colors border-b border-border/50 last:border-b-0"
            >
              <span className="font-mono text-sm text-ink-4 flex items-center gap-1.5">
                {t.id}
                {t.waitingForInput && <MessageCircle size={12} className="text-warn shrink-0" />}
              </span>
              <span className="text-sm text-ink-2 truncate">{t.title}</span>
              <Badge tone={toneFor(t.status)} className="justify-self-start normal-case">
                <Dot tone={toneFor(t.status)} size={4} pulse={t.status === 'active'} />{t.status}
              </Badge>
              <span>{t.phase ? <PhaseDots current={t.phase} /> : <span className="text-ink-6">—</span>}</span>
              <span>{t.role ? <Badge tone={t.role as any}>{t.role}</Badge> : <span className="text-ink-6">—</span>}</span>
              <span className="text-sm font-mono text-ink-5">{t.updatedAt || '—'}</span>
            </motion.div>
          ))}
        </motion.div>
      </Card>
    </div>
  );
}

function VerificationConfig({ project }: { project: Project }) {
  return (
    <div className="max-w-[1100px] space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Verification Runs</h2>
          <p className="text-sm text-ink-4 mt-1">Live check results per task, with on-demand re-runs from the dashboard.</p>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[220px_180px_1fr_120px] px-5 py-2.5 text-xs text-ink-5 uppercase tracking-wider border-b border-border bg-elevated/50">
          <span>Task</span><span>Last run</span><span>Checks</span><span>Action</span>
        </div>
        <motion.div initial="initial" animate="animate" variants={stagger(0.04)}>
          {project.tasks.map(task => (
            <VerificationRow key={task.id} task={task} />
          ))}
        </motion.div>
      </Card>
    </div>
  );
}

function verificationTone(status: 'pass' | 'fail' | 'skipped'): 'ok' | 'err' | 'muted' {
  if (status === 'pass') return 'ok';
  if (status === 'fail') return 'err';
  return 'muted';
}

function formatVerificationTimestamp(value: string | undefined | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function formatCheckDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function VerificationRow({ task }: { task: TaskEntry }) {
  const verification = useVerificationQuery(task.id);
  const rerun = useRunVerification(task.id);
  const checks = verification.data?.checks ? Object.entries(verification.data.checks) : [];

  return (
    <motion.div variants={staggerItem} className="grid grid-cols-[220px_180px_1fr_120px] gap-4 px-5 py-3 items-start border-b border-border/50 last:border-b-0">
      <div>
        <div className="text-sm font-medium text-ink">{task.title}</div>
        <div className="text-xs font-mono text-ink-5 mt-1">{task.id}</div>
      </div>

      <div className="text-sm text-ink-4">
        {verification.isLoading ? 'Loading…' : formatVerificationTimestamp(verification.data?.lastRunAt)}
      </div>

      <div className="flex flex-wrap gap-2">
        {verification.isLoading && <span className="text-sm text-ink-5">Loading results…</span>}
        {verification.isError && <Badge tone="err">failed to load</Badge>}
        {!verification.isLoading && !verification.isError && checks.length === 0 && (
          <span className="text-sm text-ink-5">No verification run recorded yet.</span>
        )}
        {checks.map(([name, result]) => (
          <Badge
            key={`${task.id}-${name}`}
            tone={verificationTone(result.status)}
            title={result.output}
            className="normal-case"
          >
            {name}: {result.status} · {formatCheckDuration(result.durationMs)}
          </Badge>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
          <Sparkles size={14} />{rerun.isPending ? 'Running…' : 'Re-run'}
        </Button>
      </div>
    </motion.div>
  );
}

function HistoryTimeline() {
  const items = [
    { ts: '10:42:18', kind: 'run', title: 'orch-f · build phase started' },
    { ts: '10:38:42', kind: 'run', title: 'orch-e · sync phase complete' },
    { ts: '10:22:08', kind: 'commit', title: 'f673649 chore: bump version to 0.6.0' },
    { ts: '09:51:27', kind: 'run', title: 'orch-d · critic advance' },
    { ts: '09:44:02', kind: 'commit', title: 'c2b6699 feat: add Playwright MCP' },
  ];
  return (
    <motion.div initial="initial" animate="animate" variants={stagger(0.1)} className="max-w-[700px]">
      <div className="relative pl-8 border-l-2 border-border space-y-5">
        {items.map(it => (
          <motion.div key={it.ts} variants={staggerItem} className="relative">
            <span className="absolute -left-[29px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-mono text-ink-5 shrink-0">{it.ts}</span>
              <Badge tone="muted">{it.kind}</Badge>
              <span className="text-sm text-ink-2">{it.title}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function toneFor(status: string): any {
  return status === 'active' ? 'accent' : status === 'done' ? 'ok' : status === 'blocked' ? 'err' : 'muted';
}
