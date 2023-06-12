import { Injectable, NotFoundException } from '@nestjs/common';
import { Activity, Prisma } from '@prisma/client';
import { Paginated, paginate, toSkipTake } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityEvent } from './activity.events';
import { ListActivityQueryDto } from './dto/list-activity.dto';

export interface ActivityView {
  id: string;
  organizationId: string;
  projectId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  createdAt: Date;
}

const activityInclude = { actor: { select: { id: true, name: true, avatarUrl: true } } } as const;

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: ActivityEvent): Promise<Activity> {
    return this.prisma.activity.create({
      data: {
        organizationId: event.organizationId,
        projectId: event.projectId ?? null,
        actorId: event.actorId ?? null,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        metadata: event.metadata ?? Prisma.JsonNull,
      },
    });
  }

  async list(organizationId: string, query: ListActivityQueryDto): Promise<Paginated<ActivityView>> {
    if (query.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: query.projectId, organizationId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    const where: Prisma.ActivityWhereInput = {
      organizationId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
    };
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({ where, include: activityInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.activity.count({ where }),
    ]);
    return paginate(
      rows.map((row) => this.toView(row)),
      total,
      query,
    );
  }

  private toView(row: Activity & { actor: ActivityView['actor'] }): ActivityView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      metadata: isRecord(row.metadata) ? row.metadata : null,
      actor: row.actor,
      createdAt: row.createdAt,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
