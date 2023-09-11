import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Invitation, InvitationStatus, MembershipRole } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AuthUser } from '../common/types/request';
import { randomToken, sha256 } from '../common/utils/crypto';
import { Env } from '../config/env';
import { MailerService } from '../mail/mail.service';
import { MemberView } from '../memberships/memberships.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/invitation.dto';

export interface InvitationView {
  id: string;
  email: string;
  role: MembershipRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { id: string; name: string };
}

export interface InvitationPublicView {
  email: string;
  role: MembershipRole;
  organization: { id: string; name: string };
  expiresAt: Date;
  status: InvitationStatus;
}

const invitationInclude = { invitedBy: { select: { id: true, name: true } } } as const;

@Injectable()
export class InvitationsService {
  private readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: PlanLimitsService,
    private readonly mailer: MailerService,
    private readonly events: EventEmitter2,
    config: ConfigService<Env, true>,
  ) {
    this.ttlDays = config.get('INVITATION_TTL_DAYS', { infer: true });
  }

  async list(organizationId: string): Promise<InvitationView[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { organizationId },
      include: invitationInclude,
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((invitation) => this.toView(this.applyExpiry(invitation)));
  }

  async create(organizationId: string, organizationName: string, actor: AuthUser, dto: CreateInvitationDto): Promise<InvitationView> {
    const alreadyMember = await this.prisma.membership.findFirst({
      where: { organizationId, user: { email: dto.email } },
    });
    if (alreadyMember) {
      throw new ConflictException('This person is already a member of the organization');
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { organizationId, email: dto.email, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pending) {
      throw new ConflictException('An invitation for this email is already pending');
    }

    await this.limits.assertCanAddMember(organizationId, { countPendingInvitations: true });

    const token = randomToken(32);
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email: dto.email,
        role: dto.role,
        tokenHash: sha256(token),
        invitedById: actor.id,
        expiresAt: new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000),
      },
      include: invitationInclude,
    });

    await this.mailer.sendInvitation(dto.email, organizationName, actor.name, token);
    this.emit({
      organizationId,
      actorId: actor.id,
      entityType: 'invitation',
      entityId: invitation.id,
      action: 'invitation.sent',
      metadata: { email: dto.email, role: dto.role },
    });
    return this.toView(invitation);
  }

  async revoke(organizationId: string, actorId: string, id: string): Promise<InvitationView> {
    const invitation = await this.prisma.invitation.findFirst({ where: { id, organizationId }, include: invitationInclude });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Invitation is already ${invitation.status.toLowerCase()}`);
    }
    const revoked = await this.prisma.invitation.update({
      where: { id },
      data: { status: 'REVOKED' },
      include: invitationInclude,
    });
    this.emit({
      organizationId,
      actorId,
      entityType: 'invitation',
      entityId: id,
      action: 'invitation.revoked',
      metadata: { email: revoked.email },
    });
    return this.toView(revoked);
  }

  async getByToken(token: string): Promise<InvitationPublicView> {
    const invitation = await this.findByTokenOrThrow(token);
    return {
      email: invitation.email,
      role: invitation.role,
      organization: invitation.organization,
      expiresAt: invitation.expiresAt,
      status: this.applyExpiry(invitation).status,
    };
  }

  /** Accepts the invitation for the signed-in user; the email must match the invitee. */
  async accept(token: string, user: AuthUser): Promise<MemberView> {
    const invitation = await this.findByTokenOrThrow(token);

    if (invitation.status === 'REVOKED') throw new GoneException('This invitation was revoked');
    if (invitation.status === 'ACCEPTED') throw new ConflictException('This invitation was already accepted');
    if (invitation.status === 'EXPIRED' || invitation.expiresAt.getTime() <= Date.now()) {
      if (invitation.status !== 'EXPIRED') {
        await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      }
      throw new GoneException('This invitation has expired');
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    const existing = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
    });
    if (existing) {
      throw new ConflictException('You are already a member of this organization');
    }

    // The invitation itself already reserved a seat, so only count real members here.
    await this.limits.assertCanAddMember(invitation.organizationId, { countPendingInvitations: false });

    const [membership] = await this.prisma.$transaction([
      this.prisma.membership.create({
        data: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role },
        include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      }),
    ]);

    this.emit({
      organizationId: invitation.organizationId,
      actorId: user.id,
      entityType: 'member',
      entityId: user.id,
      action: 'member.joined',
      metadata: { name: user.name, role: invitation.role },
    });

    return { id: membership.id, role: membership.role, createdAt: membership.createdAt, user: membership.user };
  }

  private async findByTokenOrThrow(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }

  /** Reports PENDING invitations past their expiry as EXPIRED without a write. */
  private applyExpiry<T extends Invitation>(invitation: T): T {
    if (invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= Date.now()) {
      return { ...invitation, status: 'EXPIRED' };
    }
    return invitation;
  }

  private toView(invitation: Invitation & { invitedBy: { id: string; name: string } }): InvitationView {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      invitedBy: invitation.invitedBy,
    };
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
