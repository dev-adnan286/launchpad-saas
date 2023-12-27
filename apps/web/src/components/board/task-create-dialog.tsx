'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as tasksApi from '@/lib/api/tasks';
import { getErrorMessage } from '@/lib/api/client';
import type { Label as LabelType, Member } from '@/lib/api/types';
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS, STATUS_ORDER } from '@/lib/kanban';
import { taskSchema, type TaskValues } from '@/lib/schemas/workspace';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormField, Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';

export function TaskCreateDialog({
  open,
  onOpenChange,
  projectId,
  members,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: Member[];
  labels: LabelType[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: '', description: '', status: 'TODO', priority: 'MEDIUM', assigneeId: '', dueDate: '', labelIds: [] },
  });

  React.useEffect(() => {
    if (open) {
      form.reset();
      setServerError(null);
    }
  }, [open, form]);

  const create = useMutation({
    mutationFn: (values: TaskValues) =>
      tasksApi.createTask(projectId, {
        title: values.title,
        description: values.description || null,
        status: values.status,
        priority: values.priority,
        assigneeId: values.assigneeId || null,
        dueDate: values.dueDate ? new Date(`${values.dueDate}T12:00:00`).toISOString() : null,
        labelIds: values.labelIds,
      }),
    onSuccess: () => {
      toast({ title: 'Task created', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
      onOpenChange(false);
    },
    onError: (error) => setServerError(getErrorMessage(error, 'Unable to create task')),
  });

  const selectedLabels = form.watch('labelIds');
  const toggleLabel = (labelId: string) => {
    form.setValue(
      'labelIds',
      selectedLabels.includes(labelId) ? selectedLabels.filter((id) => id !== labelId) : [...selectedLabels, labelId],
    );
  };
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New task" description="Add a task to this project.">
        <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="space-y-4" noValidate>
          <FormField label="Title" htmlFor="new-task-title" required>
            <Input id="new-task-title" placeholder="Write the launch announcement" error={errors.title?.message} {...form.register('title')} />
          </FormField>
          <FormField label="Description" htmlFor="new-task-description">
            <Textarea id="new-task-description" rows={3} error={errors.description?.message} {...form.register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Status" htmlFor="new-task-status">
              <NativeSelect id="new-task-status" className="w-full" {...form.register('status')}>
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Priority" htmlFor="new-task-priority">
              <NativeSelect id="new-task-priority" className="w-full" {...form.register('priority')}>
                {PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Assignee" htmlFor="new-task-assignee">
              <NativeSelect id="new-task-assignee" className="w-full" {...form.register('assigneeId')}>
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Due date" htmlFor="new-task-due">
              <Input id="new-task-due" type="date" error={errors.dueDate?.message} {...form.register('dueDate')} />
            </FormField>
          </div>
          {labels.length > 0 && (
            <div>
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-2">
                {labels.map((label) => {
                  const active = selectedLabels.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleLabel(label.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {serverError && (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={create.isPending}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
