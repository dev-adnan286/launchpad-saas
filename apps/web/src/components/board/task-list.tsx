'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import * as tasksApi from '@/lib/api/tasks';
import { getErrorMessage } from '@/lib/api/client';
import type { Label as LabelType, Member, TaskPriority, TaskStatus } from '@/lib/api/types';
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS, STATUS_ORDER } from '@/lib/kanban';
import { cn, formatDate, isOverdue } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge, priorityVariant, statusVariant } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';

const SORTABLE: Array<{ key: tasksApi.TaskSortBy; label: string }> = [
  { key: 'title', label: 'Task' },
  { key: 'priority', label: 'Priority' },
  { key: 'dueDate', label: 'Due' },
  { key: 'createdAt', label: 'Created' },
];

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export function TaskList({
  projectId,
  members,
  labels,
  onOpenTask,
}: {
  projectId: string;
  members: Member[];
  labels: LabelType[];
  onOpenTask: (taskId: string) => void;
}) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<TaskStatus | ''>('');
  const [priority, setPriority] = React.useState<TaskPriority | ''>('');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [labelId, setLabelId] = React.useState('');
  const [sortBy, setSortBy] = React.useState<tasksApi.TaskSortBy>('createdAt');
  const [sortOrder, setSortOrder] = React.useState<tasksApi.SortOrder>('desc');
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const debouncedSearch = useDebounced(search, 300);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, priority, assigneeId, labelId, sortBy, sortOrder]);

  const filters: tasksApi.TaskFilters = {
    search: debouncedSearch,
    status,
    priority,
    assigneeId,
    labelId,
    sortBy,
    sortOrder,
    page,
    pageSize,
  };

  const tasksQuery = useQuery({
    queryKey: ['tasks', projectId, 'list', filters],
    queryFn: () => tasksApi.listTasks(projectId, filters),
    enabled: Boolean(projectId),
    placeholderData: (previous) => previous,
  });

  const toggleSort = (key: tasksApi.TaskSortBy) => {
    if (sortBy === key) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder(key === 'title' ? 'asc' : 'desc');
    }
  };

  const meta = tasksQuery.data?.meta;
  const rows = tasksQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            aria-label="Search tasks"
            placeholder="Search tasks..."
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <NativeSelect aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | '')}>
          <option value="">All statuses</option>
          {STATUS_ORDER.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABELS[item]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority | '')}>
          <option value="">All priorities</option>
          {PRIORITY_ORDER.map((item) => (
            <option key={item} value={item}>
              {PRIORITY_LABELS[item]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Filter by assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">Anyone</option>
          {members.map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.name}
            </option>
          ))}
        </NativeSelect>
        {labels.length > 0 && (
          <NativeSelect aria-label="Filter by label" value={labelId} onChange={(event) => setLabelId(event.target.value)} className="md:col-span-5 md:w-56">
            <option value="">All labels</option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      {tasksQuery.isError ? (
        <ErrorState message={getErrorMessage(tasksQuery.error)} onRetry={() => void tasksQuery.refetch()} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {SORTABLE.map((column) => (
                <TableHead
                  key={column.key}
                  aria-sort={sortBy === column.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    {column.label}
                    {sortBy === column.key ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                    )}
                  </button>
                </TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Labels</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasksQuery.isPending ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 7 }).map((__, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableEmpty colSpan={7}>No tasks match the current filters.</TableEmpty>
            ) : (
              rows.map((task) => {
                const overdue = task.status !== 'DONE' && task.status !== 'CANCELED' && isOverdue(task.dueDate);
                return (
                  <TableRow key={task.id} className="cursor-pointer" onClick={() => onOpenTask(task.id)}>
                    <TableCell className="max-w-xs">
                      <button type="button" className="line-clamp-1 text-left font-medium text-slate-900 hover:text-brand-700">
                        {task.title}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
                    </TableCell>
                    <TableCell className={cn(overdue && 'font-medium text-rose-600')}>
                      {task.dueDate ? formatDate(task.dueDate) : <span className="text-slate-400">None</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500">{formatDate(task.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(task.status)}>{STATUS_LABELS[task.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {task.assignee ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size="xs" />
                          <span className="truncate">{task.assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {task.labels.map((label) => (
                          <Badge key={label.id} variant="outline" dotColor={label.color}>
                            {label.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total} tasks)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
