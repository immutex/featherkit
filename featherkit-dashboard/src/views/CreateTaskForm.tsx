import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useCreateTaskMutation } from '@/lib/queries';

type ToastHandler = (toast: { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string }) => void;

export function useCreateTaskForm(onToast: ToastHandler) {
  const [isCreating, setIsCreating] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const createTask = useCreateTaskMutation();

  function resetCreateForm() {
    setDraftId('');
    setDraftTitle('');
    setFormError(null);
    setIsCreating(false);
  }

  function openCreateForm() {
    setFormError(null);
    setIsCreating(true);
  }

  function toggleCreateForm() {
    if (isCreating) {
      resetCreateForm();
      return;
    }

    openCreateForm();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const id = draftId.trim();
    const title = draftTitle.trim();

    if (!id || !title) {
      setFormError('Task ID and title are required.');
      return;
    }

    setFormError(null);
    createTask.mutate(
      { id, title },
      {
        onSuccess: () => {
          resetCreateForm();
          onToast({ tone: 'ok', title: 'Task created', desc: `${id} is ready in Pending.` });
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unable to create task.';
          setFormError(message);
          onToast({ tone: 'err', title: 'Task creation failed', desc: message });
        },
      },
    );
  }

  return {
    isCreating,
    draftId,
    draftTitle,
    formError,
    isPending: createTask.isPending,
    setDraftId,
    setDraftTitle,
    resetCreateForm,
    toggleCreateForm,
    handleSubmit,
  };
}

type CreateTaskInlineFormProps = {
  draftId: string;
  draftTitle: string;
  error: string | null;
  isPending: boolean;
  onDraftIdChange: (value: string) => void;
  onDraftTitleChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  className?: string;
};

export function CreateTaskInlineForm({
  draftId,
  draftTitle,
  error,
  isPending,
  onDraftIdChange,
  onDraftTitleChange,
  onSubmit,
  onClear,
  className,
}: CreateTaskInlineFormProps) {
  return (
    <Card className={className ?? 'p-4'}>
      <form className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]" onSubmit={onSubmit}>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-5">Task ID</span>
          <input
            value={draftId}
            onChange={(event) => onDraftIdChange(event.target.value)}
            placeholder="fix-tasks-b"
            className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-5">Title</span>
          <input
            value={draftTitle}
            onChange={(event) => onDraftTitleChange(event.target.value)}
            placeholder="Describe the task"
            className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink outline-none transition-colors focus:border-accent"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="accent" size="sm" disabled={isPending}>
            {isPending ? 'Creating…' : 'Create task'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={isPending}>
            Clear
          </Button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-err">{error}</p>}
    </Card>
  );
}
