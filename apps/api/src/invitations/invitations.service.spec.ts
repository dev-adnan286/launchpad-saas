import { ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { Invitation } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { sha256 } from '../common/utils/crypto';
import { MailerService } from '../mail/mail.service';
import {
  asPrismaService,
  createConfigMock,
  createEventsMock,
  createPrismaMock,
  createRedisMock,
  makeUser,
  NOW,
  PrismaMock,
} from '../testing/mocks';
import { InvitationsService } from './invitations.service';

const ORG = 'org-1';

describe('InvitationsService', () => {
  let prisma: PrismaMock;
  let service: InvitationsService;
  let mailer: { sendInvitation: jest.Mock };
  let events: ReturnType<typeof createEventsMock>;
  const actor = makeUser({ id: 'admin-1', email: 'admin@example.com', name: 'Admin' });

  function pendingInvitation(overrides: Partial<Invitation> = {}) {
    return {
      id: 'inv-1',
      organizationId: ORG,
      email: 'new@example.com',
      role: 'MEMBER' as const,
      tokenHash: sha256('plain'),
      status: 'PENDING' as const,
      invitedById: actor.id,
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: null,
      createdAt: NOW,
      invitedBy: { id: actor.id, name: actor.name },
      organization: { id: ORG, name: 'Acme' },
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = createPrismaMock();
    const limits = new PlanLimitsService(asPrismaService(prisma), createRedisMock(false).service);
    mailer = { sendInvitation: jest.fn().mockResolvedValue(undefined) };
    events = createEventsMock();
    service = new InvitationsService(asPrismaService(prisma), limits, mailer as unknown as MailerService, events, createConfigMock());
    // FREE plan: maxMembers 5
    prisma.subscription.findUnique.mockResolvedValue({ planId: 'FREE', status: 'ACTIVE' } as never);
  });

  describe('create', () => {
    it('creates a hashed invitation, emails the plain token and emits an event', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.membership.count.mockResolvedValue(2);
      prisma.invitation.count.mockResolvedValue(1);
      prisma.invitation.create.mockImplementation((args) => Promise.resolve(pendingInvitation(args.data as object)) as never);

      const result = await service.create(ORG, 'Acme', actor, { email: 'new@example.com', role: 'MEMBER' });

      expect(result.status).toBe('PENDING');
      const plainToken = mailer.sendInvitation.mock.calls[0][3] as string;
      expect(prisma.invitation.create.mock.calls[0][0].data.tokenHash).toBe(sha256(plainToken));
      expect(mailer.sendInvitation).toHaveBeenCalledWith('new@example.com', 'Acme', 'Admin', plainToken);
      expect(events.emit).toHaveBeenCalledWith('invitation.sent', expect.objectContaining({ organizationId: ORG }));
    });

    it('enforces the plan member limit counting members + pending invitations (409)', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.membership.count.mockResolvedValue(3);
      prisma.invitation.count.mockResolvedValue(2);

      await expect(service.create(ORG, 'Acme', actor, { email: 'new@example.com', role: 'MEMBER' })).rejects.toThrow(
        /Member limit reached/,
      );
      expect(prisma.invitation.create).not.toHaveBeenCalled();
      expect(mailer.sendInvitation).not.toHaveBeenCalled();
    });

    it('rejects an existing member', async () => {
      prisma.membership.findFirst.mockResolvedValue({ id: 'm' } as never);
      await expect(service.create(ORG, 'Acme', actor, { email: 'new@example.com', role: 'MEMBER' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a duplicate pending invitation', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(pendingInvitation());
      await expect(service.create(ORG, 'Acme', actor, { email: 'new@example.com', role: 'MEMBER' })).rejects.toThrow(
        'already pending',
      );
    });
  });

  describe('accept', () => {
    const invitee = makeUser({ id: 'user-9', email: 'new@example.com', name: 'Newbie' });

    it('creates the membership, marks accepted and emits member.joined', async () => {
      prisma.invitation.findUnique.mockResolvedValue(pendingInvitation());
      prisma.membership.findUnique.mockResolvedValue(null);
      prisma.membership.count.mockResolvedValue(1);
      prisma.membership.create.mockResolvedValue({
        id: 'm-new',
        userId: invitee.id,
        organizationId: ORG,
        role: 'MEMBER',
        createdAt: NOW,
        updatedAt: NOW,
        user: { id: invitee.id, email: invitee.email, name: invitee.name, avatarUrl: null },
      } as never);
      prisma.invitation.update.mockResolvedValue(pendingInvitation({ status: 'ACCEPTED' }));

      const member = await service.accept('plain', invitee);

      expect(member.role).toBe('MEMBER');
      expect(member.user.email).toBe(invitee.email);
      expect(prisma.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) } }),
      );
      expect(events.emit).toHaveBeenCalledWith('member.joined', expect.objectContaining({ entityId: invitee.id }));
    });

    it('refuses when the signed-in email does not match', async () => {
      prisma.invitation.findUnique.mockResolvedValue(pendingInvitation());
      await expect(service.accept('plain', makeUser({ email: 'someone-else@example.com' }))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it('marks an expired invitation EXPIRED and returns 410', async () => {
      prisma.invitation.findUnique.mockResolvedValue(pendingInvitation({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.accept('plain', invitee)).rejects.toBeInstanceOf(GoneException);
      expect(prisma.invitation.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'EXPIRED' } });
    });

    it('rejects revoked and already-accepted invitations', async () => {
      prisma.invitation.findUnique.mockResolvedValue(pendingInvitation({ status: 'REVOKED' }));
      await expect(service.accept('plain', invitee)).rejects.toBeInstanceOf(GoneException);
      prisma.invitation.findUnique.mockResolvedValue(pendingInvitation({ status: 'ACCEPTED' }));
      await expect(service.accept('plain', invitee)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s for unknown tokens', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      await expect(service.accept('nope', invitee)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('enforces the member limit on acceptance without counting pending invitations', async () => {
      prisma.invitation.findUnique.mockResolvedValue(pendingInvitation());
      prisma.membership.findUnique.mockResolvedValue(null);
      prisma.membership.count.mockResolvedValue(5);
      await expect(service.accept('plain', invitee)).rejects.toThrow(/Member limit reached/);
      expect(prisma.invitation.count).not.toHaveBeenCalled();
    });
  });

  describe('list / revoke / preview', () => {
    it('reports stale PENDING invitations as EXPIRED without writing', async () => {
      prisma.invitation.findMany.mockResolvedValue([
        pendingInvitation({ id: 'fresh' }),
        pendingInvitation({ id: 'stale', expiresAt: new Date(Date.now() - 10) }),
      ] as never);
      const list = await service.list(ORG);
      expect(list.map((i) => [i.id, i.status])).toEqual([
        ['fresh', 'PENDING'],
        ['stale', 'EXPIRED'],
      ]);
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });

    it('revoke only works on pending invitations', async () => {
      prisma.invitation.findFirst.mockResolvedValue(pendingInvitation({ status: 'ACCEPTED' }));
      await expect(service.revoke(ORG, actor.id, 'inv-1')).rejects.toThrow('already accepted');

      prisma.invitation.findFirst.mockResolvedValue(pendingInvitation());
      prisma.invitation.update.mockResolvedValue(pendingInvitation({ status: 'REVOKED' }));
      const revoked = await service.revoke(ORG, actor.id, 'inv-1');
      expect(revoked.status).toBe('REVOKED');
      expect(events.emit).toHaveBeenCalledWith('invitation.revoked', expect.anything());
    });

    it('preview exposes only public fields', async () => {
      prisma.invitation.findUnique.mockResolvedValue(pendingInvitation());
      const preview = await service.getByToken('plain');
      expect(preview).toEqual({
        email: 'new@example.com',
        role: 'MEMBER',
        organization: { id: ORG, name: 'Acme' },
        expiresAt: expect.any(Date),
        status: 'PENDING',
      });
      expect(prisma.invitation.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: sha256('plain') } }));
    });
  });
});
