import { TaskStatus } from '@prisma/client';
import { canTransition, nextStatuses, TASK_STATUSES, TASK_TRANSITIONS } from './task-transitions';

describe('task transitions', () => {
  it('always allows staying in the same status', () => {
    for (const status of TASK_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it('never lists a status as its own successor', () => {
    for (const status of TASK_STATUSES) {
      expect(TASK_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it.each<[TaskStatus, TaskStatus, boolean]>([
    ['BACKLOG', 'TODO', true],
    ['BACKLOG', 'IN_PROGRESS', false],
    ['TODO', 'IN_PROGRESS', true],
    ['TODO', 'DONE', false],
    ['IN_PROGRESS', 'DONE', true],
    ['IN_REVIEW', 'TODO', false],
    ['DONE', 'IN_PROGRESS', true],
    ['DONE', 'BACKLOG', false],
    ['CANCELED', 'TODO', true],
    ['CANCELED', 'IN_PROGRESS', false],
  ])('%s -> %s is %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  it('every status can eventually reach DONE', () => {
    const reachable = (from: TaskStatus, target: TaskStatus, seen = new Set<TaskStatus>()): boolean => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return nextStatuses(from).some((next) => reachable(next, target, seen));
    };
    for (const status of TASK_STATUSES) {
      expect(reachable(status, 'DONE')).toBe(true);
    }
  });
});
