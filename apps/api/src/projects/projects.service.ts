import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Project } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

export interface ProjectView extends Project {
  taskCounts: { total: number; done: number };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: PlanLimitsService,
    private readonly events: EventEmitter2,
  ) {}

  async list(organizationId: string, includeArchived: boolean): Promise<ProjectView[]> {
    const projects = await this.prisma.project.findMany({
      where: { organizationId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    });
    return this.withCounts(projects);
  }

  async get(organizationId: string, id: string): Promise<ProjectView> {
    const project = await this.findOrThrow(organizationId, id);
    const [view] = await this.withCounts([project]);
    return view;
  }

  async create(organizationId: string, actorId: string, dto: CreateProjectDto): Promise<ProjectView> {
    await this.limits.assertCanAddProject(organizationId);
    const project = await this.prisma.project.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        ...(dto.color ? { color: dto.color } : {}),
      },
    });
    this.emit({
      organizationId,
      projectId: project.id,
      actorId,
      entityType: 'project',
      entityId: project.id,
      action: 'project.created',
      metadata: { name: project.name },
    });
    return { ...project, taskCounts: { total: 0, done: 0 } };
  }

  async update(organizationId: string, actorId: string, id: string, dto: UpdateProjectDto): Promise<ProjectView> {
    await this.findOrThrow(organizationId, id);
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
    this.emit({
      organizationId,
      projectId: id,
      actorId,
      entityType: 'project',
      entityId: id,
      action: 'project.updated',
      metadata: { name: project.name, changes: Object.keys(dto) },
    });
    const [view] = await this.withCounts([project]);
    return view;
  }

  async archive(organizationId: string, actorId: string, id: string): Promise<ProjectView> {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.archivedAt) throw new BadRequestException('Project is already archived');
    const project = await this.prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
    this.emit({
      organizationId,
      projectId: id,
      actorId,
      entityType: 'project',
      entityId: id,
      action: 'project.archived',
      metadata: { name: project.name },
    });
    const [view] = await this.withCounts([project]);
    return view;
  }

  /** Unarchiving counts toward the plan's active project limit. */
  async unarchive(organizationId: string, actorId: string, id: string): Promise<ProjectView> {
    const existing = await this.findOrThrow(organizationId, id);
    if (!existing.archivedAt) throw new BadRequestException('Project is not archived');
    await this.limits.assertCanAddProject(organizationId);
    const project = await this.prisma.project.update({ where: { id }, data: { archivedAt: null } });
    this.emit({
      organizationId,
      projectId: id,
      actorId,
      entityType: 'project',
      entityId: id,
      action: 'project.unarchived',
      metadata: { name: project.name },
    });
    const [view] = await this.withCounts([project]);
    return view;
  }

  async remove(organizationId: string, actorId: string, id: string): Promise<void> {
    const project = await this.findOrThrow(organizationId, id);
    await this.prisma.project.delete({ where: { id } });
    this.emit({
      organizationId,
      projectId: null,
      actorId,
      entityType: 'project',
      entityId: id,
      action: 'project.deleted',
      metadata: { name: project.name },
    });
  }

  async findOrThrow(organizationId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id, organizationId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async withCounts(projects: Project[]): Promise<ProjectView[]> {
    if (projects.length === 0) return [];
    const ids = projects.map((p) => p.id);
    const grouped = await this.prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: ids } },
      _count: { _all: true },
    });
    const counts = new Map<string, { total: number; done: number }>();
    for (const row of grouped) {
      const entry = counts.get(row.projectId) ?? { total: 0, done: 0 };
      entry.total += row._count._all;
      if (row.status === 'DONE') entry.done += row._count._all;
      counts.set(row.projectId, entry);
    }
    return projects.map((project) => ({
      ...project,
      taskCounts: counts.get(project.id) ?? { total: 0, done: 0 },
    }));
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
