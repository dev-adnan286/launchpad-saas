import { ConflictException, Injectable } from '@nestjs/common';
import { PlanId } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PLAN_CATALOG, PlanDefinition } from './plans';

export const PLAN_CACHE_TTL_SEC = 60;

export function planCacheKey(organizationId: string): string {
  return `org:${organizationId}:plan`;
}

export interface PlanUsage {
  projects: number;
  members: number;
}

/**
 * Resolves an organization's plan (cached in Redis) and enforces its limits.
 * Shared by projects, invitations and billing so every path applies the same rules.
 */
@Injectable()
export class PlanLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getPlanId(organizationId: string): Promise<PlanId> {
    const key = planCacheKey(organizationId);
    const cached = await this.redis.get(key);
    if (cached && cached in PLAN_CATALOG) return cached as PlanId;

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { planId: true, status: true },
    });
    // A canceled subscription falls back to the FREE tier limits.
    const planId: PlanId = subscription && subscription.status !== 'CANCELED' ? subscription.planId : 'FREE';
    await this.redis.set(key, planId, PLAN_CACHE_TTL_SEC);
    return planId;
  }

  async getPlan(organizationId: string): Promise<PlanDefinition> {
    return PLAN_CATALOG[await this.getPlanId(organizationId)];
  }

  async invalidate(organizationId: string): Promise<void> {
    await this.redis.del(planCacheKey(organizationId));
  }

  async getUsage(organizationId: string): Promise<PlanUsage> {
    const [projects, members] = await Promise.all([
      this.prisma.project.count({ where: { organizationId, archivedAt: null } }),
      this.prisma.membership.count({ where: { organizationId } }),
    ]);
    return { projects, members };
  }

  /** Throws 409 when creating/unarchiving one more active project would exceed the plan. */
  async assertCanAddProject(organizationId: string): Promise<void> {
    const plan = await this.getPlan(organizationId);
    const active = await this.prisma.project.count({ where: { organizationId, archivedAt: null } });
    if (active >= plan.maxProjects) {
      throw new ConflictException(
        `Project limit reached: the ${plan.name} plan allows ${plan.maxProjects} active projects. Upgrade to add more.`,
      );
    }
  }

  /**
   * Throws 409 when adding one more member would exceed the plan.
   * Pending invitations count as reserved seats so an org cannot over-invite.
   */
  async assertCanAddMember(organizationId: string, options: { countPendingInvitations: boolean }): Promise<void> {
    const plan = await this.getPlan(organizationId);
    const members = await this.prisma.membership.count({ where: { organizationId } });
    const pending = options.countPendingInvitations
      ? await this.prisma.invitation.count({
          where: { organizationId, status: 'PENDING', expiresAt: { gt: new Date() } },
        })
      : 0;
    if (members + pending >= plan.maxMembers) {
      throw new ConflictException(
        `Member limit reached: the ${plan.name} plan allows ${plan.maxMembers} members (including pending invitations). Upgrade to add more.`,
      );
    }
  }

  /** Validates that current usage fits into the target plan; used to refuse downgrades. */
  assertUsageFits(target: PlanDefinition, usage: PlanUsage): void {
    const problems: string[] = [];
    if (usage.projects > target.maxProjects) {
      problems.push(`${usage.projects} active projects exceed the ${target.name} limit of ${target.maxProjects}`);
    }
    if (usage.members > target.maxMembers) {
      problems.push(`${usage.members} members exceed the ${target.name} limit of ${target.maxMembers}`);
    }
    if (problems.length > 0) {
      throw new ConflictException(`Cannot switch plan: ${problems.join('; ')}. Reduce usage first.`);
    }
  }
}
