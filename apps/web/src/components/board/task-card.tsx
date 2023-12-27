'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, MessageSquare } from 'lucide-react';
import type { Task } from '@/lib/api/types';
import { PRIORITY_LABELS } from '@/lib/kanban';
import { cn, formatDate, isOverdue } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, priorityVariant } from '@/components/ui/badge';

export function TaskCardPreview({ task, className }: { task: Task; className?: string }) {
  const overdue = task.status !== 'DONE' && task.status !== 'CANCELED' && isOverdue(task.dueDate);
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white p-3 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-slate-900">{task.title}</p>
        <Badge variant={priorityVariant(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
      </div>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <Badge key={label.id} variant="outline" dotColor={label.color}>
              {label.name}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          {task.dueDate && (
            <span className={cn('flex items-center gap-1', overdue && 'font-medium text-rose-600')}>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {task.commentCount}
            </span>
          )}
        </div>
        {task.assignee ? (
          <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size="xs" />
        ) : (
          <span className="text-slate-400">Unassigned</span>
        )}
      </div>
    </div>
  );
}

export function TaskCard({ task, disabled, onOpen }: { task: Task; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
    data: { type: 'task', status: task.status },
  });

  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.title}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'cursor-grab rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:cursor-grabbing',
        isDragging && 'opacity-40',
        disabled && 'cursor-pointer',
      )}
    >
      <TaskCardPreview task={task} className="hover:border-brand-300" />
    </div>
  );
}
