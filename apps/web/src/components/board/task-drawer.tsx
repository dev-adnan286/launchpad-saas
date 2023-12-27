'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Trash2 } from 'lucide-react';
import * as tasksApi from '@/lib/api/tasks';
import * as commentsApi from '@/lib/api/comments';
import { getErrorMessage } from '@/lib/api/client';
import type { Label as LabelType, Member, Task, TaskStatus } from '@/lib/api/types';
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS, allowedStatuses } from '@/lib/kanban';
import { commentSchema, taskSchema, type CommentValues, type TaskValues } from '@/lib/schemas/workspace';
import { cn, formatDate, relativeTime, toDateInputValue } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, ConfirmDialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormField, Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';

function toFormValues(task: Task): TaskValues {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ?? '',
    dueDate: toDateInputValue(task.dueDate),
    labelIds: task.labels.map((label) => label.id),
  };
}

function toIsoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface TaskDrawerProps {
  taskId: string | null;
  projectId: string;
  members: Member[];
  labels: LabelType[];
  canEdit: boolean;
  canModerate: boolean;
  onClose: () => void;
}

export function TaskDrawer({ taskId, projectId, members, labels, canEdit, canModerate, onClose }: TaskDrawerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const taskQuery = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.getTask(taskId ?? ''),
    enabled: Boolean(taskId),
  });
  const commentsQuery = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => commentsApi.listComments(taskId ?? ''),
    enabled: Boolean(taskId),
  });

  const task = taskQuery.data;

  const form = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'TODO',
      priority: 'MEDIUM',
      assigneeId: '',
      dueDate: '',
      labelIds: [],
    },
  });

  React.useEffect(() => {
    if (task) form.reset(toFormValues(task));
  }, [task, form]);

  const invalidateTask = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project'] });
    void queryClient.invalidateQueries({ queryKey: ['activity'] });
  }, [queryClient, taskId, projectId]);

  const save = useMutation({
    mutationFn: async (values: TaskValues) => {
      if (!task) throw new Error('Task not loaded');
      let updated = await tasksApi.updateTask(task.id, {
        title: values.title,
        description: values.description || null,
        priority: values.priority,
        dueDate: toIsoDate(values.dueDate),
        assigneeId: values.assigneeId || null,
        labelIds: values.labelIds,
      });
      if (values.status !== task.status) {
        updated = await tasksApi.changeTaskStatus(task.id, values.status);
      }
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', taskId], updated);
      toast({ title: 'Task saved', variant: 'success' });
      invalidateTask();
    },
    onError: (error) => toast({ title: 'Could not save task', description: getErrorMessage(error), variant: 'error' }),
  });

  const remove = useMutation({
    mutationFn: () => tasksApi.deleteTask(task?.id ?? ''),
    onSuccess: () => {
      toast({ title: 'Task deleted', variant: 'success' });
      setConfirmDelete(false);
      invalidateTask();
      onClose();
    },
    onError: (error) => toast({ title: 'Could not delete task', description: getErrorMessage(error), variant: 'error' }),
  });

  const commentForm = useForm<CommentValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: { body: '' },
  });

  const addComment = useMutation({
    mutationFn: (values: CommentValues) => commentsApi.createComment(task?.id ?? '', values.body),
    onSuccess: () => {
      commentForm.reset();
      void queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      invalidateTask();
    },
    onError: (error) => toast({ title: 'Could not post comment', description: getErrorMessage(error), variant: 'error' }),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => commentsApi.deleteComment(commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      invalidateTask();
    },
    onError: (error) => toast({ title: 'Could not delete comment', description: getErrorMessage(error), variant: 'error' }),
  });

  const selectedLabels = form.watch('labelIds');
  const toggleLabel = (labelId: string) => {
    const next = selectedLabels.includes(labelId)
      ? selectedLabels.filter((id) => id !== labelId)
      : [...selectedLabels, labelId];
    form.setValue('labelIds', next, { shouldDirty: true });
  };

  const statusOptions: TaskStatus[] = task ? allowedStatuses(task.status) : [];
  const errors = form.formState.errors;

  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent side title={task?.title ?? 'Task'} description={task ? `Created ${formatDate(task.createdAt, true)}` : undefined}>
        {taskQuery.isError ? (
          <ErrorState message={getErrorMessage(taskQuery.error)} onRetry={() => void taskQuery.refetch()} />
        ) : !task ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-1/2" />
          </div>
        ) : (
          <div className="space-y-8">
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4" noValidate>
              <fieldset disabled={!canEdit} className="space-y-4">
                <FormField label="Title" htmlFor="task-title" required>
                  <Input id="task-title" error={errors.title?.message} {...form.register('title')} />
                </FormField>
                <FormField label="Description" htmlFor="task-description">
                  <Textarea id="task-description" rows={4} error={errors.description?.message} {...form.register('description')} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Status" htmlFor="task-status" hint="Only valid transitions are listed.">
                    <NativeSelect id="task-status" className="w-full" {...form.register('status')}>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Priority" htmlFor="task-priority">
                    <NativeSelect id="task-priority" className="w-full" {...form.register('priority')}>
                      {PRIORITY_ORDER.map((priority) => (
                        <option key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Assignee" htmlFor="task-assignee">
                    <NativeSelect id="task-assignee" className="w-full" {...form.register('assigneeId')}>
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.user.id} value={member.user.id}>
                          {member.user.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Due date" htmlFor="task-due">
                    <Input id="task-due" type="date" error={errors.dueDate?.message} {...form.register('dueDate')} />
                  </FormField>
                </div>
                <div>
                  <Label>Labels</Label>
                  {labels.length === 0 ? (
                    <p className="text-sm text-slate-500">No labels in this organization yet.</p>
                  ) : (
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
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                              active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                            )}
                          >
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
                            {label.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </fieldset>
              {canEdit && (
                <div className="flex items-center justify-between">
                  <Button type="button" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </Button>
                  <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
                    Save changes
                  </Button>
                </div>
              )}
            </form>

            <section aria-labelledby="comments-heading">
              <h3 id="comments-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Comments
                <Badge>{commentsQuery.data?.length ?? task.commentCount}</Badge>
              </h3>
              <div className="mt-3 space-y-4">
                {commentsQuery.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : commentsQuery.data && commentsQuery.data.length > 0 ? (
                  <ul className="space-y-4">
                    {commentsQuery.data.map((comment) => {
                      const mine = user?.id === comment.author.id;
                      return (
                        <li key={comment.id} className="flex gap-3">
                          <Avatar name={comment.author.name} src={comment.author.avatarUrl} size="sm" />
                          <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-slate-900">{comment.author.name}</p>
                              <div className="flex items-center gap-2">
                                <time dateTime={comment.createdAt} className="text-xs text-slate-500">
                                  {relativeTime(comment.createdAt)}
                                </time>
                                {(mine || canModerate) && (
                                  <button
                                    type="button"
                                    onClick={() => deleteComment.mutate(comment.id)}
                                    className="text-xs text-slate-400 hover:text-rose-600"
                                    aria-label="Delete comment"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{comment.body}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No comments yet.</p>
                )}
                <form
                  onSubmit={commentForm.handleSubmit((values) => addComment.mutate(values))}
                  className="flex items-start gap-2"
                  noValidate
                >
                  <Textarea
                    id="comment-body"
                    rows={2}
                    placeholder="Write a comment..."
                    aria-label="New comment"
                    error={commentForm.formState.errors.body?.message}
                    {...commentForm.register('body')}
                  />
                  <Button type="submit" size="icon" loading={addComment.isPending} aria-label="Post comment">
                    {!addComment.isPending && <Send className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </form>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task?"
        description="The task and all of its comments will be permanently removed."
        confirmLabel="Delete task"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Dialog>
  );
}
