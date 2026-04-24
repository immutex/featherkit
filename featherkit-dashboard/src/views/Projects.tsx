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
import { CreateTaskInlineForm, useCreateTaskForm } from './CreateTaskForm';
import { WorkflowCanvas } from './Workflow';
import { VerificationView } from './Verification';
import {
  type ApiHistoryEvent,
  useDashboardProjects,
  useEventsQuery,
  useRunTask,
  useSendChatMutation,
  useStateQuery,
} from '@/lib/queries';
import { ORCHESTRATOR_EVENT_NAME, type OrchestratorEvent } from '@/lib/ws';
import { GitBranch, GitCommit, Folder, Play, Filter, List, LayoutGrid, MessageCircle, Send, CornerDownLeft, Bot } from 'lucide-react';

export function ProjectsView({
  selectedProject,
  onToast,
}: {
  selectedProject: string;
  onToast: (toast: { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string }) => void;
}) {
  const projects = useDashboardProjects();
  const { data: state } = useStateQuery();
  const runTask = useRunTask();
  const project = projects.find(p => p.id === selectedProject) || projects[0];
  const [sub, setSub] = useState('tasks');

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-4">
        Waiting for workspace state…
      </div>
    );
  }

  const activeTaskId = state?.currentTask ?? project.tasks.find((task) => task.status === 'active')?.id;

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
          <Button
            variant="accent"
            size="sm"
            disabled={runTask.isPending || !activeTaskId}
            onClick={() => {
              if (!activeTaskId) {
                onToast({ tone: 'warn', title: 'No active task to run', desc: 'Activate a task first, then run the orchestrator.' });
                return;
              }

              runTask.mutate(activeTaskId, {
                onSuccess: () => {
                  onToast({ tone: 'ok', title: 'Orchestrator queued', desc: `Task ${activeTaskId} is ready to run.` });
                },
                onError: (error) => {
                  onToast({
                    tone: 'err',
                    title: 'Failed to queue orchestrator',
                    desc: error instanceof Error ? error.message : 'Unknown error',
                  });
                },
              });
            }}
          >
            <Play size={14} />{runTask.isPending ? 'Queueing…' : 'Run orchestrator'}
          </Button>
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
            {sub === 'verification' && <VerificationView tasks={project.tasks} currentTaskId={null} onToast={onToast} />}
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
  const sendChat = useSendChatMutation();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial: ChatMessage[] = [
      {
        id: 'sys-1',
        role: 'system',
        content: 'Messages sent here are relayed to the active orchestrator session.',
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      },
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
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingRequestId]);

  useEffect(() => {
    function handleEvent(event: Event) {
      const detail = (event as CustomEvent<OrchestratorEvent>).detail;
      if (detail.type !== 'chat-response' || detail.projectId !== project.id) {
        return;
      }

      if (pendingRequestId && detail.requestId && detail.requestId !== pendingRequestId) {
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: detail.requestId ?? `agent-${Date.now()}`,
          role: 'agent',
          agentName: detail.agentName ?? 'Orchestrator',
          agentColor: 'sync',
          content: detail.message,
          timestamp: formatClock(detail.at),
          taskId: detail.taskId,
        },
      ]);
      setPendingRequestId(null);
      setChatError(null);
    }

    window.addEventListener(ORCHESTRATOR_EVENT_NAME, handleEvent as EventListener);
    return () => window.removeEventListener(ORCHESTRATOR_EVENT_NAME, handleEvent as EventListener);
  }, [pendingRequestId, project.id]);

  useEffect(() => {
    if (!pendingRequestId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPendingRequestId(null);
      setMessages((current) => [
        ...current,
        {
          id: `system-timeout-${Date.now()}`,
          role: 'system',
          content: 'Still waiting for a response from the orchestrator.',
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        },
      ]);
    }, 30_000);

    return () => window.clearTimeout(timeout);
  }, [pendingRequestId]);

  function handleSend() {
    const content = input.trim();
    if (!content || sendChat.isPending || pendingRequestId) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setChatError(null);

    sendChat.mutate(
      { projectId: project.id, message: content },
      {
        onSuccess: (response) => {
          setPendingRequestId(response.requestId);
        },
        onError: (error) => {
          setChatError(error instanceof Error ? error.message : 'Failed to send message.');
        },
      },
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto fk-scroll px-8 py-6 space-y-1">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {pendingRequestId && <TypingIndicator />}
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
          <Button variant="accent" size="sm" onClick={handleSend} disabled={sendChat.isPending || Boolean(pendingRequestId)} className="h-[44px] px-4">
            <Send size={14} />{sendChat.isPending || pendingRequestId ? 'Waiting…' : 'Send'}
          </Button>
        </div>
        {chatError && <p className="mt-2 text-sm text-err text-center">{chatError}</p>}
        <p className="text-xs text-ink-5 text-center mt-2">
          Messages are routed by the orchestrator to the appropriate agent.
        </p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start py-1">
      <div className="max-w-[75%] border-l-2 border-l-role-sync/40 bg-role-sync/5 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-role-sync">
          <Bot size={13} />
          <span className="font-medium">Orchestrator</span>
          <span className="text-ink-5">is typing…</span>
        </div>
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
  const pct = project.tasks.length === 0 ? 0 : Math.round((done / project.tasks.length) * 100);
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
  const createTaskForm = useCreateTaskForm(onToast);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
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
        {view === 'list' && (
          <Button
            type="button"
            variant={createTaskForm.isCreating ? 'ghost' : 'accent'}
            size="sm"
            onClick={createTaskForm.toggleCreateForm}
          >
            {createTaskForm.isCreating ? 'Cancel' : 'New task'}
          </Button>
        )}
      </div>

      {view === 'list' && createTaskForm.isCreating && (
        <CreateTaskInlineForm
          className="mb-4 p-4"
          draftId={createTaskForm.draftId}
          draftTitle={createTaskForm.draftTitle}
          error={createTaskForm.formError}
          isPending={createTaskForm.isPending}
          onDraftIdChange={createTaskForm.setDraftId}
          onDraftTitleChange={createTaskForm.setDraftTitle}
          onSubmit={createTaskForm.handleSubmit}
          onClear={createTaskForm.resetCreateForm}
        />
      )}

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

function HistoryTimeline() {
  const events = useEventsQuery(50);

  if (events.isLoading) {
    return <div className="text-sm text-ink-5">Loading events…</div>;
  }

  if (events.isError) {
    return <div className="text-sm text-err">Failed to load recent events.</div>;
  }

  const items = (events.data ?? []).map((event, index) => ({
    id: historyEventId(event, index),
    ts: historyEventTime(event),
    kind: historyEventKind(event),
    tone: historyEventTone(event),
    title: historyEventTitle(event),
  }));

  if (items.length === 0) {
    return <div className="text-sm text-ink-5">No events yet.</div>;
  }

  return (
    <motion.div initial="initial" animate="animate" variants={stagger(0.1)} className="max-w-[700px]">
      <div className="relative pl-8 border-l-2 border-border space-y-5">
        {items.map(it => (
          <motion.div key={it.id} variants={staggerItem} className="relative">
            <span className="absolute -left-[29px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-mono text-ink-5 shrink-0">{it.ts}</span>
              <Badge tone={it.tone}>{it.kind}</Badge>
              <span className="text-sm text-ink-2">{it.title}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString('en-US', { hour12: false });
}

function historyEventId(event: ApiHistoryEvent, index: number): string {
  return asString(event.requestId) ?? asString(event.id) ?? `${asString(event.type) ?? 'event'}-${index}`;
}

function historyEventTime(event: ApiHistoryEvent): string {
  const raw = asString(event.at) ?? asString(event.ts);
  if (!raw) {
    return '—';
  }

  return formatClock(raw);
}

function historyEventKind(event: ApiHistoryEvent): string {
  const type = asString(event.type);
  if (!type || type === 'mock') {
    return asString(event.kind) ?? 'event';
  }

  if (type.startsWith('phase:')) return 'phase';
  if (type.startsWith('gate:')) return 'gate';
  if (type.startsWith('orchestrator:')) return 'orchestrator';
  if (type === 'user-input' || type === 'chat-response') return 'chat';
  return type;
}

function historyEventTone(event: ApiHistoryEvent): 'accent' | 'ok' | 'warn' | 'err' | 'muted' {
  const tone = asString(event.tone);
  if (tone === 'accent' || tone === 'ok' || tone === 'warn' || tone === 'err' || tone === 'muted') {
    return tone;
  }

  switch (asString(event.type)) {
    case 'phase:failed':
      return 'err';
    case 'phase:complete':
    case 'gate:approved':
      return 'ok';
    case 'gate:awaiting':
      return 'warn';
    case 'user-input':
    case 'chat-response':
    case 'phase:start':
      return 'accent';
    default:
      return 'muted';
  }
}

function historyEventTitle(event: ApiHistoryEvent): string {
  const type = asString(event.type);
  if (!type || type === 'mock') {
    return asString(event.title) ?? asString(event.message) ?? 'Event';
  }

  switch (type) {
    case 'phase:start':
      return `${asString(event.taskId) ?? 'task'} · ${asString(event.phase) ?? 'phase'} started`;
    case 'phase:complete':
      return `${asString(event.taskId) ?? 'task'} · ${asString(event.phase) ?? 'phase'} completed (${asString(event.status) ?? 'ok'})`;
    case 'phase:failed':
      return `${asString(event.taskId) ?? 'task'} · ${asString(event.phase) ?? 'phase'} failed: ${asString(event.reason) ?? 'Unknown error'}`;
    case 'phase:stdout':
      return asString(event.line) ?? 'Phase output';
    case 'gate:awaiting':
      return `${asString(event.taskId) ?? 'task'} · ${asString(event.phase) ?? 'phase'} awaiting approval`;
    case 'gate:approved':
      return `${asString(event.taskId) ?? 'task'} · ${asString(event.phase) ?? 'phase'} approved`;
    case 'task:done':
      return `${asString(event.taskId) ?? 'task'} completed`;
    case 'orchestrator:lock-acquired':
      return `Orchestrator lock acquired (pid ${asNumber(event.pid) ?? 'unknown'})`;
    case 'orchestrator:lock-released':
      return 'Orchestrator lock released';
    case 'orchestrator:stale-lock-cleared':
      return `Cleared stale lock from pid ${asNumber(event.stalePid) ?? 'unknown'}`;
    case 'user-input':
      return `User input${asString(event.taskId) ? ` · ${asString(event.taskId)}` : ''}: ${asString(event.message) ?? ''}`;
    case 'chat-response':
      return `${asString(event.agentName) ?? 'Orchestrator'}: ${asString(event.message) ?? ''}`;
    default:
      return type;
  }
}

function toneFor(status: string): any {
  return status === 'active' ? 'accent' : status === 'done' ? 'ok' : status === 'blocked' ? 'err' : 'muted';
}
