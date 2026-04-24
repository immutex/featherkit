import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';

import { CreateTaskInlineForm } from '@/views/CreateTaskForm';

describe('CreateTaskInlineForm', () => {
  it('renders the required task fields', () => {
    render(
      <CreateTaskInlineForm
        draftId=""
        draftTitle=""
        error={null}
        isPending={false}
        onDraftIdChange={() => {}}
        onDraftTitleChange={() => {}}
        onSubmit={() => {}}
        onClear={() => {}}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Task ID' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create task' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('forwards field changes and actions to the provided handlers', () => {
    const onDraftIdChange = vi.fn();
    const onDraftTitleChange = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    const onClear = vi.fn();

    render(
      <CreateTaskInlineForm
        draftId=""
        draftTitle=""
        error={null}
        isPending={false}
        onDraftIdChange={onDraftIdChange}
        onDraftTitleChange={onDraftTitleChange}
        onSubmit={onSubmit}
        onClear={onClear}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Task ID' }), { target: { value: 'fix-tasks-d' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Shared form test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onDraftIdChange).toHaveBeenCalledWith('fix-tasks-d');
    expect(onDraftTitleChange).toHaveBeenCalledWith('Shared form test');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders inline error messages', () => {
    render(
      <CreateTaskInlineForm
        draftId="fix-tasks-b"
        draftTitle="Duplicate"
        error="Task fix-tasks-b already exists."
        isPending={false}
        onDraftIdChange={() => {}}
        onDraftTitleChange={() => {}}
        onSubmit={() => {}}
        onClear={() => {}}
      />,
    );

    expect(screen.getByText('Task fix-tasks-b already exists.')).toBeInTheDocument();
  });
});
