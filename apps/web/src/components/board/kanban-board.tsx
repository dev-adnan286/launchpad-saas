'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import * as tasksApi from '@/lib/api/tasks';
import { getErrorMessage } from '@/lib/api/client';
import type { Task, TaskStatus } from '@/lib/api/types';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  canTransition,
  findTaskColumn,
  flattenColumns,
  groupTasksByStatus,
  mergeTasks,
  moveTask,
  type BoardColumns,
} from '@/lib/kanban';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { TaskCard, TaskCardPreview } from './task-card';

export function tasksQueryKey(projectId: string) {
  return ['tasks', projectId, 'board'] as const;
}

function isStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (STATUS_ORDER as readonly string[]).includes(value);
}

function Column({
  status,
  tasks,
  activeFrom,
  canEdit,
  onOpenTask,
}: {
  status: TaskStatus;
  tasks: Task[];
  activeFrom: TaskStatus | null;
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { type: 'column', status } });
  const allowed = activeFrom === null || canTransition(activeFrom, status);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABELS[status]} column`}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border bg-slate-100/70 transition-colors',
        isOver && allowed ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200',
        activeFrom !== null && !allowed && 'opacity-50',
      )}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className={cn('inline-block h-2.5 w-2.5 rounded-full', STATUS_COLORS[status])} aria-hidden="true" />
          {STATUS_LABELS[status]}
        </h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[6rem] flex-1 flex-col gap-2 px-2 pb-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} disabled={!canEdit} onOpen={() => onOpenTask(task.id)} />
          ))}
          {tasks.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
              No tasks
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

export function KanbanBoard({
  projectId,
  canEdit,
  onOpenTask,
}: {
  projectId: string;
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = tasksQueryKey(projectId);

  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => tasksApi.listAllTasks(projectId),
    enabled: Boolean(projectId),
  });

  const serverTasks = React.useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const [columns, setColumns] = React.useState<BoardColumns>(() => groupTasksByStatus(serverTasks));
  const [activeTask, setActiveTask] = React.useState<Task | null>(null);
  const [activeFrom, setActiveFrom] = React.useState<TaskStatus | null>(null);
  const snapshotRef = React.useRef<BoardColumns | null>(null);

  React.useEffect(() => {
    if (!activeTask) setColumns(groupTasksByStatus(serverTasks));
  }, [serverTasks, activeTask]);

  const reorder = useMutation({
    mutationFn: tasksApi.reorderTask,
    onSuccess: (updated) => {
      queryClient.setQueryData<Task[]>(queryKey, (previous) => mergeTasks(previous ?? [], updated));
      void queryClient.invalidateQueries({ queryKey: ['tasks', projectId, 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['project'] });
    },
    onError: (error) => {
      if (snapshotRef.current) setColumns(snapshotRef.current);
      toast({ title: 'Could not move task', description: getErrorMessage(error), variant: 'error' });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resolveTarget = (event: DragOverEvent | DragEndEvent): { status: TaskStatus; index: number } | null => {
    const over = event.over;
    if (!over) return null;
    const overData = over.data.current as { type?: string; status?: TaskStatus } | undefined;
    if (overData?.type === 'column' && isStatus(overData.status)) {
      return { status: overData.status, index: columns[overData.status].length };
    }
    const overStatus = findTaskColumn(columns, String(over.id));
    if (!overStatus) return null;
    const index = columns[overStatus].findIndex((task) => task.id === over.id);
    return { status: overStatus, index: index < 0 ? columns[overStatus].length : index };
  };

  const handleDragStart = (event: DragStartEvent) => {
    const from = findTaskColumn(columns, String(event.active.id));
    const task = from ? columns[from].find((item) => item.id === event.active.id) ?? null : null;
    snapshotRef.current = columns;
    setActiveTask(task);
    setActiveFrom(from);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const target = resolveTarget(event);
    if (!target || !activeTask) return;
    const current = findTaskColumn(columns, activeTask.id);
    if (!current || current === target.status) return;
    if (!snapshotRef.current || !canTransition(activeFrom ?? current, target.status)) return;
    const next = moveTask(columns, activeTask.id, target.status, target.index);
    if (next) setColumns(next);
  };

  const finishDrag = () => {
    setActiveTask(null);
    setActiveFrom(null);
    snapshotRef.current = null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const snapshot = snapshotRef.current;
    const from = activeFrom;
    const task = activeTask;
    const target = resolveTarget(event);
    if (!snapshot || !from || !task || !target) {
      if (snapshot) setColumns(snapshot);
      finishDrag();
      return;
    }
    if (!canTransition(from, target.status)) {
      setColumns(snapshot);
      toast({
        title: 'Move not allowed',
        description: `Tasks cannot move from ${STATUS_LABELS[from]} to ${STATUS_LABELS[target.status]}.`,
        variant: 'error',
      });
      finishDrag();
      return;
    }
    // Compute the final layout from the original snapshot so the index is deterministic.
    const next = moveTask(snapshot, task.id, target.status, target.index);
    if (!next) {
      setColumns(snapshot);
      finishDrag();
      return;
    }
    const finalIndex = next[target.status].findIndex((item) => item.id === task.id);
    const original = snapshot[from].findIndex((item) => item.id === task.id);
    setColumns(next);
    if (from === target.status && finalIndex === original) {
      finishDrag();
      return;
    }
    // Keep the snapshot for rollback in onError.
    snapshotRef.current = snapshot;
    setActiveTask(null);
    setActiveFrom(null);
    queryClient.setQueryData<Task[]>(queryKey, flattenColumns(next));
    reorder.mutate({ taskId: task.id, toStatus: target.status, toIndex: finalIndex });
  };

  if (tasksQuery.isError) {
    return <ErrorState message={getErrorMessage(tasksQuery.error)} onRetry={() => void tasksQuery.refetch()} />;
  }

  if (tasksQuery.isPending) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.map((status) => (
          <Skeleton key={status} className="h-72 w-72 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        if (snapshotRef.current) setColumns(snapshotRef.current);
        finishDrag();
      }}
    >
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            activeFrom={activeFrom}
            canEdit={canEdit}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCardPreview task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
