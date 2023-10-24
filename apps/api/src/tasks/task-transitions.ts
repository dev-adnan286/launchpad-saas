import { TaskStatus } from '@prisma/client';

/**
 * Allowed status transitions. Moving a task to its current status is always allowed
 * (that is a plain reorder inside a column).
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  BACKLOG: ['TODO', 'CANCELED'],
  TODO: ['BACKLOG', 'IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['TODO', 'IN_REVIEW', 'DONE', 'CANCELED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE', 'CANCELED'],
  DONE: ['IN_PROGRESS', 'IN_REVIEW'],
  CANCELED: ['BACKLOG', 'TODO'],
};

export const TASK_STATUSES: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED'];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TASK_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: TaskStatus): TaskStatus[] {
  return TASK_TRANSITIONS[from];
}
