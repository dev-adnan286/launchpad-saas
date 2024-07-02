import type { Task, TaskPriority, TaskStatus } from './api/types';

/** Column order on the board. */
export const STATUS_ORDER: readonly TaskStatus[] = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELED',
] as const;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
  CANCELED: 'Canceled',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  BACKLOG: 'bg-slate-400',
  TODO: 'bg-sky-500',
  IN_PROGRESS: 'bg-amber-500',
  IN_REVIEW: 'bg-violet-500',
  DONE: 'bg-emerald-500',
  CANCELED: 'bg-rose-400',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const PRIORITY_ORDER: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/** Allowed status transitions (mirrors API validation). Same-status moves are always allowed. */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  BACKLOG: ['TODO', 'CANCELED'],
  TODO: ['BACKLOG', 'IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['TODO', 'IN_REVIEW', 'DONE', 'CANCELED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE', 'CANCELED'],
  DONE: ['IN_PROGRESS', 'IN_REVIEW'],
  CANCELED: ['BACKLOG', 'TODO'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TASK_TRANSITIONS[from].includes(to);
}

/** Statuses a task may move to from `from`, including its current status first. */
export function allowedStatuses(from: TaskStatus): TaskStatus[] {
  return [from, ...TASK_TRANSITIONS[from]];
}

export type BoardColumns = Record<TaskStatus, Task[]>;

export function emptyColumns(): BoardColumns {
  return {
    BACKLOG: [],
    TODO: [],
    IN_PROGRESS: [],
    IN_REVIEW: [],
    DONE: [],
    CANCELED: [],
  };
}

/** Group tasks by status, each column sorted by position then createdAt. */
export function groupTasksByStatus(tasks: readonly Task[]): BoardColumns {
  const columns = emptyColumns();
  for (const task of tasks) {
    columns[task.status].push(task);
  }
  for (const status of STATUS_ORDER) {
    columns[status] = [...columns[status]].sort(
      (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
    );
  }
  return columns;
}

export function findTaskColumn(columns: BoardColumns, taskId: string): TaskStatus | null {
  for (const status of STATUS_ORDER) {
    if (columns[status].some((task) => task.id === taskId)) return status;
  }
  return null;
}

function renumber(tasks: readonly Task[], status: TaskStatus): Task[] {
  return tasks.map((task, index) =>
    task.position === index && task.status === status ? task : { ...task, status, position: index },
  );
}

/**
 * Move a task to `toStatus` at `toIndex`. Returns a new BoardColumns object with
 * positions renumbered in the affected columns, or `null` when the move is not
 * allowed (unknown task or invalid status transition). The input is never mutated.
 */
export function moveTask(
  columns: BoardColumns,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number,
): BoardColumns | null {
  const fromStatus = findTaskColumn(columns, taskId);
  if (!fromStatus) return null;
  if (!canTransition(fromStatus, toStatus)) return null;

  const source = columns[fromStatus];
  const fromIndex = source.findIndex((task) => task.id === taskId);
  const moving = source[fromIndex];
  if (!moving) return null;

  if (fromStatus === toStatus) {
    const clampedIndex = Math.max(0, Math.min(toIndex, source.length - 1));
    if (clampedIndex === fromIndex) return columns;
    const next = source.filter((task) => task.id !== taskId);
    next.splice(clampedIndex, 0, moving);
    return { ...columns, [fromStatus]: renumber(next, fromStatus) };
  }

  const nextSource = source.filter((task) => task.id !== taskId);
  const target = columns[toStatus];
  const clampedIndex = Math.max(0, Math.min(toIndex, target.length));
  const nextTarget = [...target];
  nextTarget.splice(clampedIndex, 0, { ...moving, status: toStatus });

  return {
    ...columns,
    [fromStatus]: renumber(nextSource, fromStatus),
    [toStatus]: renumber(nextTarget, toStatus),
  };
}

/** Flatten columns back into a single task array. */
export function flattenColumns(columns: BoardColumns): Task[] {
  return STATUS_ORDER.flatMap((status) => columns[status]);
}

/** Merge tasks returned by the reorder endpoint into an existing task list. */
export function mergeTasks(existing: readonly Task[], updated: readonly Task[]): Task[] {
  const byId = new Map(updated.map((task) => [task.id, task]));
  const merged = existing.map((task) => byId.get(task.id) ?? task);
  const known = new Set(existing.map((task) => task.id));
  for (const task of updated) {
    if (!known.has(task.id)) merged.push(task);
  }
  return merged;
}
