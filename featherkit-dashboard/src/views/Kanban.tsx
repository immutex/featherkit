import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dot } from '@/components/ui/Dot';
import { PhaseDots } from '@/components/ui/PhaseDots';
import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { stagger, staggerItem } from '@/lib/motion';
import type { TaskEntry, TaskStatus } from '@/data/mock';
import { usePatchTask } from '@/lib/queries';
import { CreateTaskInlineForm, useCreateTaskForm } from './CreateTaskForm';

const columns: { id: TaskStatus; label: string; tone: 'muted' | 'accent' | 'err' | 'ok' }[] = [
  { id: 'pending', label: 'Pending', tone: 'muted' },
  { id: 'active', label: 'Active', tone: 'accent' },
  { id: 'blocked', label: 'Blocked', tone: 'err' },
  { id: 'done', label: 'Done', tone: 'ok' },
];

export function KanbanBoard({
  tasks,
  onToast,
}: {
  tasks: TaskEntry[];
  onToast: (toast: { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string }) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const patchTask = usePatchTask();
  const createTaskForm = useCreateTaskForm(onToast);

  function onStart(e: DragStartEvent) { setDragId(String(e.active.id)); }
  function onEnd(e: DragEndEvent) {
    setDragId(null);
    const overId = e.over?.id;
    if (!overId) return;

    const taskId = String(e.active.id);
    const status = String(overId) as TaskStatus;
    const currentTask = tasks.find((task) => task.id === taskId);

    if (!currentTask || currentTask.status === status) {
      return;
    }

    patchTask.mutate(
      { taskId, status },
      {
        onError: (error) => {
          onToast({
            tone: 'err',
            title: 'Task update rejected',
            desc: error instanceof Error ? error.message : 'Unable to update task status.',
          });
        },
      },
    );
  }

  const dragged = tasks.find(t => t.id === dragId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-2">Kanban board</h2>
          <p className="text-sm text-ink-4">Drag tasks between lanes or add a new pending task.</p>
        </div>
        <Button
          type="button"
          variant={createTaskForm.isCreating ? 'ghost' : 'accent'}
          size="sm"
          onClick={createTaskForm.toggleCreateForm}
        >
          {createTaskForm.isCreating ? 'Cancel' : 'New task'}
        </Button>
      </div>

      {createTaskForm.isCreating && (
        <CreateTaskInlineForm
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

      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
        <motion.div
          initial="initial"
          animate="animate"
          variants={stagger(0.08)}
          className="grid grid-cols-1 gap-4 max-w-[1400px] md:grid-cols-2 xl:grid-cols-4"
        >
          {columns.map(col => {
            const items = tasks.filter(t => t.status === col.id).sort((a, b) => (a.uiOrder ?? 0) - (b.uiOrder ?? 0));
            return (
              <motion.div key={col.id} variants={staggerItem}>
                <Column id={col.id} label={col.label} tone={col.tone} items={items} />
              </motion.div>
            );
          })}
        </motion.div>
        <DragOverlay>{dragged && <TaskCard task={dragged} dragging />}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ id, label, tone, items }: { id: TaskStatus; label: string; tone: 'muted' | 'accent' | 'err' | 'ok'; items: TaskEntry[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border bg-surface/40 flex flex-col min-h-[300px] transition-colors',
        isOver ? 'border-accent/50 bg-accent-dim/40' : 'border-border',
      )}
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dot tone={tone} size={5} />
          <span className="text-sm font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-xs font-mono text-ink-5">{items.length}</span>
      </div>
      <div className="p-2.5 space-y-2.5 flex-1">
        {items.length === 0 ? (
          <div className="text-sm text-ink-5 text-center py-6">empty</div>
        ) : (
          items.map(t => <DraggableCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task }: { task: TaskEntry }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('cursor-grab active:cursor-grabbing', isDragging && 'opacity-30')}
    >
      <TaskCard task={task} />
    </div>
  );
}

function TaskCard({ task, dragging }: { task: TaskEntry; dragging?: boolean }) {
  return (
    <motion.div layout variants={staggerItem}>
      <Card className={cn('p-4 hover:border-border-light transition-colors', dragging && 'shadow-xl ring-1 ring-accent/40')}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-mono text-ink-5">{task.id}</span>
          {task.role && <Badge tone={task.role as any}>{task.role}</Badge>}
        </div>
        <div className="text-sm font-medium leading-snug mb-2 text-ink-2">{task.title}</div>
        {task.phase && (
          <div className="flex items-center gap-2 mb-2">
            <PhaseDots current={task.phase} />
            {task.model && <span className="text-xs text-ink-5 font-mono truncate">{task.model}</span>}
          </div>
        )}
        {task.status === 'active' && task.progress && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-bg/60 border border-border font-mono text-xs text-ink-3 truncate">
            <span className="text-accent">▸ </span>{task.progress}
          </div>
        )}
        {task.status === 'blocked' && task.blockReason && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-err/5 border border-err/20 text-xs text-err/90 truncate">
            {task.blockReason}
          </div>
        )}
        {task.dependsOn && task.dependsOn.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-ink-5 uppercase tracking-wider">deps</span>
            {task.dependsOn.map(d => <Badge key={d} tone="muted" className="normal-case">{d}</Badge>)}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
