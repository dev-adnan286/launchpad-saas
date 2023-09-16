import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Membership, MembershipRole } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { membershipCacheKey } from '../common/guards/org-member.guard';
import { roleAtLeast } from '../common/types/request';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface MemberView {
  id: string;
  role: MembershipRole;
  createdAt: Date;
  user: { id: string; email: string; name: string; avatarUrl: string | null };
}

const memberInclude = { user: { select: { id: true, email: true, name: true, avatarUrl: true } } } as const;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  async list(organizationId: string): Promise<MemberView[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: memberInclude,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return memberships.map((m) => this.toView(m));
  }

  /**
   * Changes a member's role. Rules:
   *  - Only OWNERs may grant or take away the OWNER role.
   *  - Admins cannot modify members ranked above them.
   *  - The last OWNER cannot be demoted.
   */
  async changeRole(organizationId: string, actor: Membership, memberId: string, role: MembershipRole): Promise<MemberView> {
    const target = await this.findOrThrow(organizationId, memberId);

    if ((role === 'OWNER' || target.role === 'OWNER') && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only an owner can assign or remove the OWNER role');
    }
    if (!roleAtLeast(actor.role, target.role)) {
      throw new ForbiddenException('You cannot change the role of a member ranked above you');
    }
    if (target.role === 'OWNER' && role !== 'OWNER') {
      await this.assertNotLastOwner(organizationId, target.id);
    }
    if (target.role === role) return this.toView(target);

    const updated = await this.prisma.membership.update({
      where: { id: target.id },
      data: { role },
      include: memberInclude,
    });
    await this.redis.del(membershipCacheKey(target.userId, organizationId));

    this.emit({
      organizationId,
      actorId: actor.userId,
      entityType: 'member',
      entityId: target.userId,
      action: 'member.role_changed',
      metadata: { name: updated.user.name, from: target.role, to: role },
    });
    return this.toView(updated);
  }

  /** Removes a member. Admins can remove lower-ranked members; anyone can remove themselves. */
  async remove(organizationId: string, actor: Membership, memberId: string): Promise<void> {
    const target = await this.findOrThrow(organizationId, memberId);
    const isSelf = target.userId === actor.userId;

    if (!isSelf) {
      if (!roleAtLeast(actor.role, 'ADMIN')) {
        throw new ForbiddenException('Only admins can remove members');
      }
      if (target.role === 'OWNER' && actor.role !== 'OWNER') {
        throw new ForbiddenException('Only an owner can remove another owner');
      }
    }
    if (target.role === 'OWNER') {
      await this.assertNotLastOwner(organizationId, target.id);
    }

    await this.prisma.membership.delete({ where: { id: target.id } });
    await this.redis.del(membershipCacheKey(target.userId, organizationId));

    this.emit({
      organizationId,
      actorId: actor.userId,
      entityType: 'member',
      entityId: target.userId,
      action: isSelf ? 'member.left' : 'member.removed',
      metadata: { name: target.user.name, role: target.role },
    });
  }

  private async assertNotLastOwner(organizationId: string, membershipId: string): Promise<void> {
    const otherOwners = await this.prisma.membership.count({
      where: { organizationId, role: 'OWNER', id: { not: membershipId } },
    });
    if (otherOwners === 0) {
      throw new BadRequestException('An organization must keep at least one owner');
    }
  }

  private async findOrThrow(organizationId: string, memberId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: memberId, organizationId },
      include: memberInclude,
    });
    if (!membership) throw new NotFoundException('Member not found');
    return membership;
  }

  private toView(membership: Membership & { user: MemberView['user'] }): MemberView {
    return { id: membership.id, role: membership.role, createdAt: membership.createdAt, user: membership.user };
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
