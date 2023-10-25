import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { asPrismaService, createEventsMock, createPrismaMock, NOW, PrismaMock } from '../testing/mocks';
import { TasksService, TaskWithRelations } from './tasks.service';

const ORG = 'org-1';
const PROJECT = 'project-1';
const ACTOR = 'user-1';

function makeTask(overrides: Partial<TaskWithRelations> = {}): TaskWithRelations {
  return {
    id: 'task-1',
    projectId: PROJECT,
    title: 'Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    position: 0,
    assigneeId: null,
    creatorId: ACTOR,
    dueDate: null,
    createdAt: NOW,
    updatedAt: NOW,
    assignee: null,
    labels: [],
    _count: { comments: 0 },
    ...overrides,
  };
}

/** Strips the nested `labels` write so the created row keeps the relation shape of makeTask. */
function createdFields(data: unknown): Partial<TaskWithRelations> {
  const { labels: _labels, ...rest } = data as { labels?: unknown } & Partial<TaskWithRelations>;
  return rest;
}

describe('TasksService', () => {
  let prisma: PrismaMock;
  let events: ReturnType<typeof createEventsMock>;
  let service: TasksService;

  beforeEach(() => {
    prisma = createPrismaMock();
    events = createEventsMock();
    service = new TasksService(asPrismaService(prisma), events);
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT } as never);
  });

  describe('create', () => {
    it('appends the task at max(position)+1 of its status column', async () => {
      prisma.task.aggregate.mockResolvedValue({ _max: { position: 4 } } as never);
      prisma.task.create.mockImplementation((args) => Promise.resolve(makeTask({ ...createdFields(args.data), id: 'new' })) as never);

      const result = await service.create(ORG, PROJECT, ACTOR, { title: 'New', status: 'IN_PROGRESS' });

      expect(result.position).toBe(5);
      expect(result.status).toBe('IN_PROGRESS');
      expect(events.emit).toHaveBeenCalledWith('task.created', expect.objectContaining({ entityId: 'new', projectId: PROJECT }));
    });

    it('starts at position 0 in an empty column and defaults status/priority', async () => {
      prisma.task.aggregate.mockResolvedValue({ _max: { position: null } } as never);
      prisma.task.create.mockImplementation((args) => Promise.resolve(makeTask(createdFields(args.data))) as never);

      const result = await service.create(ORG, PROJECT, ACTOR, { title: 'First' });
      expect(result.position).toBe(0);
      expect(result.status).toBe('TODO');
      expect(result.priority).toBe('MEDIUM');
    });

    it('rejects an assignee who is not an org member', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);
      await expect(service.create(ORG, PROJECT, ACTOR, { title: 'x', assigneeId: 'stranger' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects labels from another organization', async () => {
      prisma.label.count.mockResolvedValue(1);
      await expect(service.create(ORG, PROJECT, ACTOR, { title: 'x', labelIds: ['l1', 'l2'] })).rejects.toThrow(
        'labels do not belong',
      );
    });

    it('404s when the project is not in the org', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.create(ORG, 'other', ACTOR, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('changeStatus', () => {
    it('allows a valid transition and appends to the new column', async () => {
      prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'TODO' }));
      prisma.task.aggregate.mockResolvedValue({ _max: { position: 2 } } as never);
      prisma.task.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS', position: 3 }));

      const result = await service.changeStatus(ORG, ACTOR, 'task-1', 'IN_PROGRESS');

      expect(result.status).toBe('IN_PROGRESS');
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'IN_PROGRESS', position: 3 } }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'task.status_changed',
        expect.objectContaining({ metadata: { title: 'Task', from: 'TODO', to: 'IN_PROGRESS' } }),
      );
    });

    it.each<[TaskStatus, TaskStatus]>([
      ['BACKLOG', 'DONE'],
      ['TODO', 'DONE'],
      ['TODO', 'IN_REVIEW'],
      ['DONE', 'TODO'],
      ['CANCELED', 'DONE'],
    ])('rejects invalid transition %s -> %s with 422', async (from, to) => {
      prisma.task.findFirst.mockResolvedValue(makeTask({ status: from }));
      await expect(service.changeStatus(ORG, ACTOR, 'task-1', to)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('is a no-op for the same status', async () => {
      prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'TODO' }));
      const result = await service.changeStatus(ORG, ACTOR, 'task-1', 'TODO');
      expect(result.status).toBe('TODO');
      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    const column = (status: TaskStatus, ids: string[]) => ids.map((id) => ({ id, status }));

    it('moves a task within its column and renumbers densely', async () => {
      prisma.task.findFirst.mockResolvedValue(makeTask({ id: 'c', status: 'TODO', position: 2 }));
      prisma.task.findMany
        .mockResolvedValueOnce(column('TODO', ['a', 'b', 'c', 'd']) as never)
        .mockResolvedValueOnce([] as never);
      prisma.task.update.mockImplementation((args) => Promise.resolve(makeTask({ id: args.where.id })) as never);

      await service.reorder(ORG, ACTOR, { taskId: 'c', toStatus: 'TODO', toIndex: 0 });

      const writes = prisma.task.update.mock.calls.map(([args]) => [args.where.id, args.data]);
      expect(writes).toEqual([
        ['c', { position: 0, status: 'TODO' }],
        ['a', { position: 1, status: 'TODO' }],
        ['b', { position: 2, status: 'TODO' }],
        ['d', { position: 3, status: 'TODO' }],
      ]);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('moves a task across columns, renumbering both, and emits status_changed', async () => {
      prisma.task.findFirst.mockResolvedValue(makeTask({ id: 'b', status: 'TODO', position: 1 }));
      prisma.task.findMany
        .mockResolvedValueOnce([...column('TODO', ['a', 'b', 'c']), ...column('IN_PROGRESS', ['x', 'y'])] as never)
        .mockResolvedValueOnce([] as never);
      prisma.task.update.mockImplementation((args) => Promise.resolve(makeTask({ id: args.where.id })) as never);

      await service.reorder(ORG, ACTOR, { taskId: 'b', toStatus: 'IN_PROGRESS', toIndex: 1 });

      const writes = prisma.task.update.mock.calls.map(([args]) => [args.where.id, args.data]);
      expect(writes).toEqual([
        ['x', { position: 0, status: 'IN_PROGRESS' }],
        ['b', { position: 1, status: 'IN_PROGRESS' }],
        ['y', { position: 2, status: 'IN_PROGRESS' }],
        ['a', { position: 0 }],
        ['c', { position: 1 }],
      ]);
      expect(events.emit).toHaveBeenCalledWith(
        'task.status_changed',
        expect.objectContaining({ metadata: expect.objectContaining({ from: 'TODO', to: 'IN_PROGRESS' }) }),
      );
    });

    it('clamps an out-of-range index to the end of the column', async () => {
      prisma.task.findFirst.mockResolvedValue(makeTask({ id: 'b', status: 'TODO' }));
      prisma.task.findMany
        .mockResolvedValueOnce([...column('TODO', ['a', 'b']), ...column('IN_PROGRESS', ['x'])] as never)
        .mockResolvedValueOnce([] as never);
      prisma.task.update.mockImplementation((args) => Promise.resolve(makeTask({ id: args.where.id })) as never);

      await service.reorder(ORG, ACTOR, { taskId: 'b', toStatus: 'IN_PROGRESS', toIndex: 99 });
      const writes = prisma.task.update.mock.calls.map(([args]) => [args.where.id, args.data]);
      expect(writes[0]).toEqual(['x', { position: 0, status: 'IN_PROGRESS' }]);
      expect(writes[1]).toEqual(['b', { position: 1, status: 'IN_PROGRESS' }]);
    });

    it('refuses an invalid cross-column transition', async () => {
      prisma.task.findFirst.mockResolvedValue(makeTask({ status: 'BACKLOG' }));
      await expect(service.reorder(ORG, ACTOR, { taskId: 'task-1', toStatus: 'DONE', toIndex: 0 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdate', () => {
    it('requires at least one field', async () => {
      await expect(service.bulkUpdate(ORG, ACTOR, { taskIds: ['a'], data: {} })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s when some ids are outside the org', async () => {
      prisma.task.findMany.mockResolvedValue([makeTask({ id: 'a' })] as never);
      await expect(
        service.bulkUpdate(ORG, ACTOR, { taskIds: ['a', 'b'], data: { priority: 'HIGH' } }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies priority + status with validated transitions and sequential positions', async () => {
      prisma.task.findMany.mockResolvedValue([
        makeTask({ id: 'a', status: 'TODO' }),
        makeTask({ id: 'b', status: 'TODO' }),
        makeTask({ id: 'c', status: 'IN_PROGRESS' }),
      ] as never);
      prisma.task.aggregate.mockResolvedValue({ _max: { position: 1 } } as never);
      prisma.task.update.mockImplementation((args) => Promise.resolve(makeTask({ id: args.where.id })) as never);

      const result = await service.bulkUpdate(ORG, ACTOR, {
        taskIds: ['a', 'b', 'c'],
        data: { status: 'IN_PROGRESS', priority: 'URGENT' },
      });

      expect(result).toEqual({ updated: 3 });
      const writes = prisma.task.update.mock.calls.map(([args]) => [args.where.id, args.data]);
      expect(writes).toEqual([
        ['a', { priority: 'URGENT', status: 'IN_PROGRESS', position: 2 }],
        ['b', { priority: 'URGENT', status: 'IN_PROGRESS', position: 3 }],
        ['c', { priority: 'URGENT' }],
      ]);
      expect(prisma.task.aggregate).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith('task.bulk_updated', expect.objectContaining({ metadata: expect.objectContaining({ count: 3 }) }));
    });

    it('rejects the whole batch if any transition is invalid', async () => {
      prisma.task.findMany.mockResolvedValue([makeTask({ id: 'a', status: 'BACKLOG' })] as never);
      await expect(
        service.bulkUpdate(ORG, ACTOR, { taskIds: ['a'], data: { status: 'DONE' } }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('unassigns with assigneeId null', async () => {
      prisma.task.findMany.mockResolvedValue([makeTask({ id: 'a' })] as never);
      prisma.task.update.mockResolvedValue(makeTask());
      await service.bulkUpdate(ORG, ACTOR, { taskIds: ['a'], data: { assigneeId: null } });
      expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: { assignee: { disconnect: true } } }));
    });
  });

  describe('list', () => {
    it('builds filters, pagination and returns the envelope', async () => {
      prisma.task.findMany.mockResolvedValue([makeTask({ labels: [{ label: { id: 'l', name: 'bug', color: '#f00' } }] as never })] as never);
      prisma.task.count.mockResolvedValue(41);

      const result = await service.list(ORG, PROJECT, {
        page: 2,
        pageSize: 20,
        status: 'TODO',
        search: 'hero',
        labelId: 'l',
        sortBy: 'dueDate',
        sortOrder: 'desc',
      });

      expect(result.meta).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 });
      expect(result.data[0].labels).toEqual([{ id: 'l', name: 'bug', color: '#f00' }]);
      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args?.skip).toBe(20);
      expect(args?.take).toBe(20);
      expect(args?.where).toMatchObject({ projectId: PROJECT, status: 'TODO', labels: { some: { labelId: 'l' } } });
      expect(args?.where?.OR).toHaveLength(2);
      expect(args?.orderBy).toEqual([{ dueDate: { sort: 'desc', nulls: 'last' } }, { position: 'asc' }]);
    });

    it('sorts by priority rank in memory', async () => {
      prisma.task.findMany.mockResolvedValue([
        makeTask({ id: 'low', priority: 'LOW' }),
        makeTask({ id: 'urgent', priority: 'URGENT' }),
        makeTask({ id: 'high', priority: 'HIGH' }),
      ] as never);
      prisma.task.count.mockResolvedValue(3);
      const result = await service.list(ORG, PROJECT, { page: 1, pageSize: 20, sortBy: 'priority', sortOrder: 'desc' });
      expect(result.data.map((t) => t.id)).toEqual(['urgent', 'high', 'low']);
    });
  });

  it('assign validates membership and emits assigned/unassigned', async () => {
    prisma.task.findFirst.mockResolvedValue(makeTask());
    prisma.membership.findUnique.mockResolvedValue({ id: 'm' } as never);
    prisma.task.update.mockResolvedValue(makeTask({ assigneeId: 'u2', assignee: { id: 'u2', name: 'Bob', avatarUrl: null } }));

    await service.assign(ORG, ACTOR, 'task-1', { assigneeId: 'u2' });
    expect(events.emit).toHaveBeenCalledWith('task.assigned', expect.objectContaining({ metadata: expect.objectContaining({ assigneeName: 'Bob' }) }));

    prisma.task.update.mockResolvedValue(makeTask());
    await service.assign(ORG, ACTOR, 'task-1', { assigneeId: null });
    expect(events.emit).toHaveBeenCalledWith('task.unassigned', expect.anything());
  });
});
