import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Membership, MembershipRole } from '@prisma/client';
import { membershipCacheKey } from '../common/guards/org-member.guard';
import { asPrismaService, createEventsMock, createPrismaMock, createRedisMock, makeMembership, NOW, PrismaMock } from '../testing/mocks';
import { MembershipsService } from './memberships.service';

const ORG = makeMembership().organizationId;

function member(id: string, userId: string, role: MembershipRole): Membership & { user: { id: string; email: string; name: string; avatarUrl: null } } {
  return {
    ...makeMembership({ id, userId, role, organizationId: ORG }),
    user: { id: userId, email: `${userId}@example.com`, name: userId, avatarUrl: null },
  };
}

describe('MembershipsService', () => {
  let prisma: PrismaMock;
  let redis: ReturnType<typeof createRedisMock>;
  let events: ReturnType<typeof createEventsMock>;
  let service: MembershipsService;
  const owner = makeMembership({ id: 'm-owner', userId: 'owner', role: 'OWNER', organizationId: ORG });
  const admin = makeMembership({ id: 'm-admin', userId: 'admin', role: 'ADMIN', organizationId: ORG });

  beforeEach(() => {
    prisma = createPrismaMock();
    redis = createRedisMock(true);
    events = createEventsMock();
    service = new MembershipsService(asPrismaService(prisma), redis.service, events);
    prisma.membership.update.mockImplementation((args) =>
      Promise.resolve({ ...member('m-target', 'target', 'MEMBER'), ...(args.data as object), updatedAt: NOW }) as never,
    );
  });

  describe('changeRole', () => {
    it('lets an admin promote a member and invalidates the cache', async () => {
      await redis.service.set(membershipCacheKey('target', ORG), 'cached');
      prisma.membership.findFirst.mockResolvedValue(member('m-target', 'target', 'MEMBER'));

      const result = await service.changeRole(ORG, admin, 'm-target', 'ADMIN');

      expect(result.role).toBe('ADMIN');
      expect(redis.store.has(membershipCacheKey('target', ORG))).toBe(false);
      expect(events.emit).toHaveBeenCalledWith('member.role_changed', expect.objectContaining({ metadata: expect.objectContaining({ from: 'MEMBER', to: 'ADMIN' }) }));
    });

    it('forbids admins from granting OWNER', async () => {
      prisma.membership.findFirst.mockResolvedValue(member('m-target', 'target', 'MEMBER'));
      await expect(service.changeRole(ORG, admin, 'm-target', 'OWNER')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids admins from demoting an owner', async () => {
      prisma.membership.findFirst.mockResolvedValue(member('m-target', 'target', 'OWNER'));
      await expect(service.changeRole(ORG, admin, 'm-target', 'MEMBER')).rejects.toThrow('Only an owner');
    });

    it('prevents demoting the last owner', async () => {
      prisma.membership.findFirst.mockResolvedValue(member('m-owner', 'owner', 'OWNER'));
      prisma.membership.count.mockResolvedValue(0);
      await expect(service.changeRole(ORG, owner, 'm-owner', 'ADMIN')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows demoting an owner when another owner remains', async () => {
      prisma.membership.findFirst.mockResolvedValue(member('m-target', 'target', 'OWNER'));
      prisma.membership.count.mockResolvedValue(1);
      const result = await service.changeRole(ORG, owner, 'm-target', 'ADMIN');
      expect(result.role).toBe('ADMIN');
    });

    it('is a no-op when the role is unchanged', async () => {
      prisma.membership.findFirst.mockResolvedValue(member('m-target', 'target', 'MEMBER'));
      await service.changeRole(ORG, admin, 'm-target', 'MEMBER');
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it('404s for members of other orgs', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      await expect(service.changeRole(ORG, owner, 'ghost', 'MEMBER')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('lets a member leave on their own', async () => {
      const self = makeMembership({ id: 'm-self', userId: 'self', role: 'VIEWER', organizationId: ORG });
      prisma.membership.findFirst.mockResolvedValue(member('m-self', 'self', 'VIEWER'));
      prisma.membership.delete.mockResolvedValue(self);
      await service.remove(ORG, self, 'm-self');
      expect(prisma.membership.delete).toHaveBeenCalledWith({ where: { id: 'm-self' } });
      expect(events.emit).toHaveBeenCalledWith('member.left', expect.anything());
    });

    it('forbids members from removing others', async () => {
      const plain = makeMembership({ id: 'm-plain', userId: 'plain', role: 'MEMBER', organizationId: ORG });
      prisma.membership.findFirst.mockResolvedValue(member('m-target', 'target', 'VIEWER'));
      await expect(service.remove(ORG, plain, 'm-target')).rejects.toThrow('Only admins');
    });

    it('lets admins remove lower roles but not owners', async () => {
      prisma.membership.findFirst.mockResolvedValue(member('m-target', 'target', 'MEMBER'));
      prisma.membership.delete.mockResolvedValue(makeMembership());
      await service.remove(ORG, admin, 'm-target');
      expect(events.emit).toHaveBeenCalledWith('member.removed', expect.anything());

      prisma.membership.findFirst.mockResolvedValue(member('m-owner', 'owner', 'OWNER'));
      await expect(service.remove(ORG, admin, 'm-owner')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('prevents removing the last owner, even themselves', async () => {
      prisma.membership.findFirst.mockResolvedValue(member('m-owner', 'owner', 'OWNER'));
      prisma.membership.count.mockResolvedValue(0);
      await expect(service.remove(ORG, owner, 'm-owner')).rejects.toThrow('at least one owner');
    });
  });
});
