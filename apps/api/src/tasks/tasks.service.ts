import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Task, TaskPriority, TaskStatus } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { Paginated, paginate, toSkipTake } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignTaskDto,
  BulkUpdateTasksDto,
  CreateTaskDto,
  ListTasksQueryDto,
  ReorderTaskDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { canTransition } from './task-transitions';

export interface TaskView {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  assigneeId: string | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  creatorId: string;
  dueDate: Date | null;
  labels: Array<{ id: string; name: string; color: string }>;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const taskInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const PRIORITY_RANK: Record<TaskPriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ───────────────────────── Queries ─────────────────────────

  async list(organizationId: string, projectId: string, query: ListTasksQueryDto): Promise<Paginated<TaskView>> {
    await this.assertProject(organizationId, projectId);
    const where: Prisma.TaskWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.labelId ? { labels: { some: { labelId: query.labelId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const { skip, take } = toSkipTake(query);
    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);
    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({ where, include: taskInclude, orderBy, skip, take }),
      this.prisma.task.count({ where }),
    ]);

    let items = rows.map((row) => this.toView(row));
    // Prisma cannot order enums by semantic rank, so priority sorting is finished in memory per page.
    if (query.sortBy === 'priority') {
      const direction = query.sortOrder === 'desc' ? -1 : 1;
      items = [...items].sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * direction);
    }
    return paginate(items, total, query);
  }

  async get(organizationId: string, taskId: string): Promise<TaskView> {
    return this.toView(await this.findOrThrow(organizationId, taskId));
  }

  // ───────────────────────── Mutations ─────────────────────────

  async create(organizationId: string, projectId: string, actorId: string, dto: CreateTaskDto): Promise<TaskView> {
    await this.assertProject(organizationId, projectId);
    const status = dto.status ?? 'TODO';
    if (dto.assigneeId) await this.assertMember(organizationId, dto.assigneeId);
    if (dto.labelIds?.length) await this.assertLabels(organizationId, dto.labelIds);

    const position = await this.nextPosition(projectId, status);
    const task = await this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description ?? null,
        status,
        priority: dto.priority ?? 'MEDIUM',
        position,
        assigneeId: dto.assigneeId ?? null,
        creatorId: actorId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        labels: dto.labelIds?.length ? { create: dto.labelIds.map((labelId) => ({ labelId })) } : undefined,
      },
      include: taskInclude,
    });

    this.emit({
      organizationId,
      projectId,
      actorId,
      entityType: 'task',
      entityId: task.id,
      action: 'task.created',
      metadata: { title: task.title, status },
    });
    return this.toView(task);
  }

  async update(organizationId: string, actorId: string, taskId: string, dto: UpdateTaskDto): Promise<TaskView> {
    const existing = await this.findOrThrow(organizationId, taskId);
    if (dto.assigneeId) await this.assertMember(organizationId, dto.assigneeId);
    if (dto.labelIds?.length) await this.assertLabels(organizationId, dto.labelIds);

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.labelIds !== undefined
          ? { labels: { deleteMany: {}, create: dto.labelIds.map((labelId) => ({ labelId })) } }
          : {}),
      },
      include: taskInclude,
    });

    this.emit({
      organizationId,
      projectId: existing.projectId,
      actorId,
      entityType: 'task',
      entityId: taskId,
      action: 'task.updated',
      metadata: { title: task.title, changes: Object.keys(dto) },
    });
    return this.toView(task);
  }

  async remove(organizationId: string, actorId: string, taskId: string): Promise<void> {
    const task = await this.findOrThrow(organizationId, taskId);
    await this.prisma.task.delete({ where: { id: taskId } });
    this.emit({
      organizationId,
      projectId: task.projectId,
      actorId,
      entityType: 'task',
      entityId: taskId,
      action: 'task.deleted',
      metadata: { title: task.title },
    });
  }

  /** Validates the transition and appends the task to the end of the new column. */
  async changeStatus(organizationId: string, actorId: string, taskId: string, status: TaskStatus): Promise<TaskView> {
    const task = await this.findOrThrow(organizationId, taskId);
    if (task.status === status) return this.toView(task);
    this.assertTransition(task.status, status);

    const position = await this.nextPosition(task.projectId, status);
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status, position },
      include: taskInclude,
    });

    this.emit({
      organizationId,
      projectId: task.projectId,
      actorId,
      entityType: 'task',
      entityId: taskId,
      action: 'task.status_changed',
      metadata: { title: task.title, from: task.status, to: status },
    });
    return this.toView(updated);
  }

  async assign(organizationId: string, actorId: string, taskId: string, dto: AssignTaskDto): Promise<TaskView> {
    const task = await this.findOrThrow(organizationId, taskId);
    if (dto.assigneeId) await this.assertMember(organizationId, dto.assigneeId);

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: dto.assigneeId },
      include: taskInclude,
    });
    this.emit({
      organizationId,
      projectId: task.projectId,
      actorId,
      entityType: 'task',
      entityId: taskId,
      action: dto.assigneeId ? 'task.assigned' : 'task.unassigned',
      metadata: { title: task.title, assigneeId: dto.assigneeId, assigneeName: updated.assignee?.name ?? null },
    });
    return this.toView(updated);
  }

  /**
   * Moves a task to `toStatus` at `toIndex`, renumbering positions in the source and
   * destination columns so they stay dense (0..n-1). Returns all tasks of affected columns.
   */
  async reorder(organizationId: string, actorId: string, dto: ReorderTaskDto): Promise<TaskView[]> {
    const task = await this.findOrThrow(organizationId, dto.taskId);
    const fromStatus = task.status;
    this.assertTransition(fromStatus, dto.toStatus);

    const affectedStatuses = fromStatus === dto.toStatus ? [fromStatus] : [fromStatus, dto.toStatus];
    const columns = await this.prisma.task.findMany({
      where: { projectId: task.projectId, status: { in: affectedStatuses } },
      select: { id: true, status: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const source = columns.filter((t) => t.status === fromStatus && t.id !== task.id).map((t) => t.id);
    const destination =
      fromStatus === dto.toStatus ? [...source] : columns.filter((t) => t.status === dto.toStatus).map((t) => t.id);
    const index = Math.min(dto.toIndex, destination.length);
    destination.splice(index, 0, task.id);

    const updates: Prisma.PrismaPromise<Task>[] = [];
    destination.forEach((id, position) => {
      updates.push(this.prisma.task.update({ where: { id }, data: { position, status: dto.toStatus } }));
    });
    if (fromStatus !== dto.toStatus) {
      source.forEach((id, position) => {
        updates.push(this.prisma.task.update({ where: { id }, data: { position } }));
      });
    }
    await this.prisma.$transaction(updates);

    if (fromStatus !== dto.toStatus) {
      this.emit({
        organizationId,
        projectId: task.projectId,
        actorId,
        entityType: 'task',
        entityId: task.id,
        action: 'task.status_changed',
        metadata: { title: task.title, from: fromStatus, to: dto.toStatus },
      });
    }

    const rows = await this.prisma.task.findMany({
      where: { projectId: task.projectId, status: { in: affectedStatuses } },
      include: taskInclude,
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
    });
    return rows.map((row) => this.toView(row));
  }

  /** Applies the same change to many tasks; status changes are validated per task. */
  async bulkUpdate(organizationId: string, actorId: string, dto: BulkUpdateTasksDto): Promise<{ updated: number }> {
    if (!dto.data.status && !dto.data.priority && dto.data.assigneeId === undefined) {
      throw new BadRequestException('Provide at least one field to update');
    }
    if (dto.data.assigneeId) await this.assertMember(organizationId, dto.data.assigneeId);

    const tasks = await this.prisma.task.findMany({
      where: { id: { in: dto.taskIds }, project: { organizationId } },
    });
    if (tasks.length !== dto.taskIds.length) {
      throw new NotFoundException('One or more tasks were not found');
    }

    const positionCounters = new Map<string, number>();
    const updates: Prisma.PrismaPromise<Task>[] = [];
    for (const task of tasks) {
      const data: Prisma.TaskUpdateInput = {};
      if (dto.data.priority) data.priority = dto.data.priority;
      if (dto.data.assigneeId !== undefined) {
        data.assignee = dto.data.assigneeId ? { connect: { id: dto.data.assigneeId } } : { disconnect: true };
      }
      if (dto.data.status && dto.data.status !== task.status) {
        this.assertTransition(task.status, dto.data.status);
        const key = `${task.projectId}:${dto.data.status}`;
        const base = positionCounters.get(key) ?? (await this.nextPosition(task.projectId, dto.data.status));
        positionCounters.set(key, base + 1);
        data.status = dto.data.status;
        data.position = base;
      }
      updates.push(this.prisma.task.update({ where: { id: task.id }, data }));
    }
    await this.prisma.$transaction(updates);

    const projectIds = [...new Set(tasks.map((t) => t.projectId))];
    for (const projectId of projectIds) {
      this.emit({
        organizationId,
        projectId,
        actorId,
        entityType: 'task',
        entityId: projectId,
        action: 'task.bulk_updated',
        metadata: { count: tasks.filter((t) => t.projectId === projectId).length, changes: { ...dto.data } },
      });
    }
    return { updated: tasks.length };
  }

  // ───────────────────────── Helpers ─────────────────────────

  async findOrThrow(organizationId: string, taskId: string): Promise<TaskWithRelations> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { organizationId } },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  toView(task: TaskWithRelations): TaskView {
    const { labels, _count, ...rest } = task;
    return {
      ...rest,
      labels: labels.map((entry) => entry.label),
      commentCount: _count.comments,
    };
  }

  private assertTransition(from: TaskStatus, to: TaskStatus): void {
    if (!canTransition(from, to)) {
      throw new UnprocessableEntityException(`Cannot move a task from ${from} to ${to}`);
    }
  }

  private async nextPosition(projectId: string, status: TaskStatus): Promise<number> {
    const aggregate = await this.prisma.task.aggregate({
      where: { projectId, status },
      _max: { position: true },
    });
    return (aggregate._max.position ?? -1) + 1;
  }

  private async assertProject(organizationId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async assertMember(organizationId: string, userId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException('Assignee must be a member of the organization');
  }

  private async assertLabels(organizationId: string, labelIds: string[]): Promise<void> {
    const unique = [...new Set(labelIds)];
    const count = await this.prisma.label.count({ where: { id: { in: unique }, organizationId } });
    if (count !== unique.length) throw new BadRequestException('One or more labels do not belong to this organization');
  }

  private buildOrderBy(sortBy: ListTasksQueryDto['sortBy'], sortOrder: 'asc' | 'desc'): Prisma.TaskOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'dueDate':
        return [{ dueDate: { sort: sortOrder, nulls: 'last' } }, { position: 'asc' }];
      case 'title':
        return [{ title: sortOrder }];
      case 'createdAt':
        return [{ createdAt: sortOrder }];
      case 'priority':
        return [{ createdAt: 'desc' }];
      case 'position':
      default:
        return [{ status: 'asc' }, { position: sortOrder }];
    }
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
