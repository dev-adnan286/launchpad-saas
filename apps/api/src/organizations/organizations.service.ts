import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipRole, Organization, PlanId, TaskStatus } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { membershipCacheKey } from '../common/guards/org-member.guard';
import { randomBase62, slugify } from '../common/utils/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

export interface OrgSummary extends Organization {
  role: MembershipRole;
  plan: PlanId;
  memberCount: number;
  projectCount: number;
}

export interface DashboardStats {
  projects: number;
  tasks: { total: number; open: number; done: number; overdue: number };
  members: number;
  tasksByStatus: Record<TaskStatus, number>;
}

const summaryInclude = {
  subscription: { select: { planId: true } },
  _count: { select: { memberships: true, projects: { where: { archivedAt: null } } } },
} as const;

type OrgWithCounts = Organization & {
  subscription: { planId: PlanId } | null;
  _count: { memberships: number; projects: number };
};

const ALL_STATUSES: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED'];

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  async create(ownerId: string, dto: CreateOrganizationDto): Promise<OrgSummary> {
    const slug = await this.resolveSlug(dto.slug ?? slugify(dto.name));
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        ownerId,
        memberships: { create: { userId: ownerId, role: 'OWNER' } },
        subscription: {
          create: { planId: 'FREE', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
      },
      include: summaryInclude,
    });

    this.emit({
      organizationId: organization.id,
      actorId: ownerId,
      entityType: 'organization',
      entityId: organization.id,
      action: 'organization.created',
      metadata: { name: organization.name },
    });

    return this.toSummary(organization, 'OWNER');
  }

  async listForUser(userId: string): Promise<OrgSummary[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: { include: summaryInclude } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => this.toSummary(membership.organization, membership.role));
  }

  async getForMember(organizationId: string, role: MembershipRole): Promise<OrgSummary> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: summaryInclude,
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return this.toSummary(organization, role);
  }

  async update(organizationId: string, actorId: string, role: MembershipRole, dto: UpdateOrganizationDto): Promise<OrgSummary> {
    if (dto.slug) {
      const taken = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
      if (taken && taken.id !== organizationId) {
        throw new ConflictException('This slug is already in use');
      }
    }
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      },
      include: summaryInclude,
    });
    await this.invalidateMembershipCaches(organizationId);

    this.emit({
      organizationId,
      actorId,
      entityType: 'organization',
      entityId: organizationId,
      action: 'organization.updated',
      metadata: { name: organization.name, slug: organization.slug },
    });
    return this.toSummary(organization, role);
  }

  async remove(organizationId: string, actorId: string): Promise<void> {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organization not found');
    if (organization.ownerId !== actorId) {
      throw new ForbiddenException('Only the organization owner can delete it');
    }
    await this.invalidateMembershipCaches(organizationId);
    await this.prisma.organization.delete({ where: { id: organizationId } });
  }

  async getStats(organizationId: string): Promise<DashboardStats> {
    const now = new Date();
    const [projects, members, grouped, overdue] = await Promise.all([
      this.prisma.project.count({ where: { organizationId, archivedAt: null } }),
      this.prisma.membership.count({ where: { organizationId } }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { project: { organizationId, archivedAt: null } },
        _count: { _all: true },
      }),
      this.prisma.task.count({
        where: {
          project: { organizationId, archivedAt: null },
          dueDate: { lt: now },
          status: { notIn: ['DONE', 'CANCELED'] },
        },
      }),
    ]);

    const tasksByStatus = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<TaskStatus, number>;
    for (const row of grouped) {
      tasksByStatus[row.status] = row._count._all;
    }
    const total = ALL_STATUSES.reduce((sum, status) => sum + tasksByStatus[status], 0);
    const done = tasksByStatus.DONE;
    const open = total - done - tasksByStatus.CANCELED;

    return { projects, members, tasks: { total, open, done, overdue }, tasksByStatus };
  }

  /** Drops every cached membership entry for the organization (used after org-wide changes). */
  async invalidateMembershipCaches(organizationId: string): Promise<void> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      select: { userId: true },
    });
    await this.redis.del(...memberships.map((m) => membershipCacheKey(m.userId, organizationId)));
  }

  private async resolveSlug(base: string): Promise<string> {
    const normalized = base || 'workspace';
    const existing = await this.prisma.organization.findUnique({ where: { slug: normalized } });
    if (!existing) return normalized;
    return `${normalized.slice(0, 40)}-${randomBase62(6).toLowerCase()}`;
  }

  private toSummary(organization: OrgWithCounts, role: MembershipRole): OrgSummary {
    const { subscription, _count, ...rest } = organization;
    return {
      ...rest,
      role,
      plan: subscription?.planId ?? 'FREE',
      memberCount: _count.memberships,
      projectCount: _count.projects,
    };
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
