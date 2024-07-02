import { describe, expect, it } from 'vitest';
import type { Task, TaskStatus } from './api/types';
import {
  STATUS_ORDER,
  TASK_TRANSITIONS,
  allowedStatuses,
  canTransition,
  findTaskColumn,
  flattenColumns,
  groupTasksByStatus,
  mergeTasks,
  moveTask,
} from './kanban';

function task(id: string, status: TaskStatus, position: number, createdAt = '2026-01-01T00:00:00.000Z'): Task {
  return {
    id,
    projectId: 'p1',
    title: `Task ${id}`,
    description: null,
    status,
    priority: 'MEDIUM',
    position,
    assigneeId: null,
    assignee: null,
    creatorId: 'u1',
    dueDate: null,
    labels: [],
    commentCount: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

const fixture: Task[] = [
  task('a', 'TODO', 0),
  task('b', 'TODO', 1),
  task('c', 'TODO', 2),
  task('d', 'IN_PROGRESS', 0),
  task('e', 'DONE', 0),
];

describe('canTransition', () => {
  it('always allows same-status moves', () => {
    for (const status of STATUS_ORDER) expect(canTransition(status, status)).toBe(true);
  });

  it('matches the transition matrix exactly', () => {
    for (const from of STATUS_ORDER) {
      for (const to of STATUS_ORDER) {
        const expected = from === to || TASK_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });

  it('encodes the documented rules', () => {
    expect(canTransition('BACKLOG', 'TODO')).toBe(true);
    expect(canTransition('BACKLOG', 'DONE')).toBe(false);
    expect(canTransition('TODO', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('TODO', 'DONE')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'DONE')).toBe(true);
    expect(canTransition('IN_REVIEW', 'TODO')).toBe(false);
    expect(canTransition('DONE', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('DONE', 'BACKLOG')).toBe(false);
    expect(canTransition('CANCELED', 'BACKLOG')).toBe(true);
    expect(canTransition('CANCELED', 'DONE')).toBe(false);
  });

  it('lists allowed statuses with the current one first', () => {
    expect(allowedStatuses('DONE')).toEqual(['DONE', 'IN_PROGRESS', 'IN_REVIEW']);
  });
});

describe('groupTasksByStatus', () => {
  it('creates every column and sorts by position', () => {
    const columns = groupTasksByStatus([task('b', 'TODO', 1), task('a', 'TODO', 0)]);
    expect(Object.keys(columns).sort()).toEqual([...STATUS_ORDER].sort());
    expect(columns.TODO.map((t) => t.id)).toEqual(['a', 'b']);
    expect(columns.DONE).toEqual([]);
  });

  it('breaks position ties by creation time', () => {
    const columns = groupTasksByStatus([
      task('late', 'TODO', 0, '2026-02-01T00:00:00.000Z'),
      task('early', 'TODO', 0, '2026-01-01T00:00:00.000Z'),
    ]);
    expect(columns.TODO.map((t) => t.id)).toEqual(['early', 'late']);
  });

  it('does not mutate the input', () => {
    const input = [task('b', 'TODO', 1), task('a', 'TODO', 0)];
    groupTasksByStatus(input);
    expect(input.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('moveTask', () => {
  it('reorders within a column and renumbers positions', () => {
    const columns = groupTasksByStatus(fixture);
    const next = moveTask(columns, 'c', 'TODO', 0);
    expect(next).not.toBeNull();
    expect(next?.TODO.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(next?.TODO.map((t) => t.position)).toEqual([0, 1, 2]);
    // untouched columns keep identity
    expect(next?.IN_PROGRESS).toBe(columns.IN_PROGRESS);
  });

  it('moves between columns, updates status and renumbers both', () => {
    const columns = groupTasksByStatus(fixture);
    const next = moveTask(columns, 'b', 'IN_PROGRESS', 0);
    expect(next?.TODO.map((t) => t.id)).toEqual(['a', 'c']);
    expect(next?.TODO.map((t) => t.position)).toEqual([0, 1]);
    expect(next?.IN_PROGRESS.map((t) => t.id)).toEqual(['b', 'd']);
    expect(next?.IN_PROGRESS.map((t) => t.position)).toEqual([0, 1]);
    expect(next?.IN_PROGRESS[0]?.status).toBe('IN_PROGRESS');
  });

  it('clamps the target index to the column bounds', () => {
    const columns = groupTasksByStatus(fixture);
    const next = moveTask(columns, 'd', 'IN_REVIEW', 99);
    expect(next?.IN_REVIEW.map((t) => t.id)).toEqual(['d']);
    const same = moveTask(columns, 'a', 'TODO', 99);
    expect(same?.TODO.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns the same object when nothing changes', () => {
    const columns = groupTasksByStatus(fixture);
    expect(moveTask(columns, 'a', 'TODO', 0)).toBe(columns);
  });

  it('returns null for an invalid transition or unknown task', () => {
    const columns = groupTasksByStatus(fixture);
    expect(moveTask(columns, 'a', 'DONE', 0)).toBeNull();
    expect(moveTask(columns, 'missing', 'TODO', 0)).toBeNull();
  });

  it('never mutates the input columns', () => {
    const columns = groupTasksByStatus(fixture);
    const snapshot = JSON.stringify(columns);
    moveTask(columns, 'b', 'IN_PROGRESS', 1);
    expect(JSON.stringify(columns)).toBe(snapshot);
  });
});

describe('helpers', () => {
  it('findTaskColumn locates a task or returns null', () => {
    const columns = groupTasksByStatus(fixture);
    expect(findTaskColumn(columns, 'e')).toBe('DONE');
    expect(findTaskColumn(columns, 'nope')).toBeNull();
  });

  it('flattenColumns preserves column order', () => {
    const columns = groupTasksByStatus(fixture);
    expect(flattenColumns(columns).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('mergeTasks replaces existing entries and appends unknown ones', () => {
    const merged = mergeTasks(fixture, [task('a', 'IN_PROGRESS', 5), task('z', 'BACKLOG', 0)]);
    expect(merged.find((t) => t.id === 'a')?.status).toBe('IN_PROGRESS');
    expect(merged).toHaveLength(6);
    expect(merged[merged.length - 1]?.id).toBe('z');
  });
});
