import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanId, Subscription } from '@prisma/client';
import { ActivityEvent } from '../activity/activity.events';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookEventDto } from './dto/billing.dto';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider';
import { PlanLimitsService, PlanUsage } from './plan-limits.service';
import { PLAN_CATALOG, PlanDefinition, listPlans } from './plans';
import { verifyWebhookSignature } from './webhook-signature';

export interface BillingOverview {
  plan: PlanDefinition;
  subscription: Subscription;
  usage: PlanUsage;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: PlanLimitsService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    config: ConfigService<Env, true>,
  ) {
    this.webhookSecret = config.get('BILLING_WEBHOOK_SECRET', { infer: true });
  }

  listPlans(): PlanDefinition[] {
    return listPlans();
  }

  async getOverview(organizationId: string): Promise<BillingOverview> {
    const subscription = await this.getOrCreateSubscription(organizationId);
    const usage = await this.limits.getUsage(organizationId);
    return { plan: PLAN_CATALOG[subscription.planId], subscription, usage };
  }

  async changePlan(organizationId: string, actorId: string, planId: PlanId): Promise<BillingOverview> {
    const target = PLAN_CATALOG[planId];
    if (!target) throw new BadRequestException('Unknown plan');

    const subscription = await this.getOrCreateSubscription(organizationId);
    if (subscription.planId === planId && subscription.status === 'ACTIVE') {
      return this.getOverview(organizationId);
    }

    const usage = await this.limits.getUsage(organizationId);
    this.limits.assertUsageFits(target, usage);

    const providerResult = subscription.externalId
      ? await this.provider.changePlan(subscription.externalId, planId)
      : await this.provider.createSubscription(organizationId, planId);

    const updated = await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        planId,
        status: 'ACTIVE',
        externalId: providerResult.externalId,
        currentPeriodStart: providerResult.currentPeriodStart,
        currentPeriodEnd: providerResult.currentPeriodEnd,
        cancelAtPeriodEnd: false,
      },
    });
    await this.limits.invalidate(organizationId);

    this.emit({
      organizationId,
      actorId,
      entityType: 'subscription',
      entityId: updated.id,
      action: 'subscription.plan_changed',
      metadata: { from: subscription.planId, to: planId },
    });

    return { plan: target, subscription: updated, usage };
  }

  /**
   * Handles provider callbacks. The raw body is HMAC-verified before any parsing is trusted.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined, event: WebhookEventDto): Promise<void> {
    if (!verifyWebhookSignature(this.webhookSecret, rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const subscription = await this.prisma.subscription.findFirst({ where: { externalId: event.data.externalId } });
    if (!subscription) {
      this.logger.warn(`Webhook for unknown subscription ${event.data.externalId} ignored`);
      return;
    }

    switch (event.type) {
      case 'subscription.updated': {
        const planId = event.data.planId ?? subscription.planId;
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            planId,
            status: 'ACTIVE',
            ...(event.data.currentPeriodEnd ? { currentPeriodEnd: new Date(event.data.currentPeriodEnd) } : {}),
          },
        });
        this.emit({
          organizationId: subscription.organizationId,
          entityType: 'subscription',
          entityId: subscription.id,
          action: 'subscription.updated',
          metadata: { planId },
        });
        break;
      }
      case 'payment.failed': {
        await this.prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'PAST_DUE' } });
        this.emit({
          organizationId: subscription.organizationId,
          entityType: 'subscription',
          entityId: subscription.id,
          action: 'subscription.payment_failed',
        });
        break;
      }
      case 'subscription.canceled': {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'CANCELED', cancelAtPeriodEnd: true },
        });
        this.emit({
          organizationId: subscription.organizationId,
          entityType: 'subscription',
          entityId: subscription.id,
          action: 'subscription.canceled',
        });
        break;
      }
    }
    await this.limits.invalidate(subscription.organizationId);
  }

  async getOrCreateSubscription(organizationId: string): Promise<Subscription> {
    const existing = await this.prisma.subscription.findUnique({ where: { organizationId } });
    if (existing) return existing;

    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organization not found');

    return this.prisma.subscription.create({
      data: {
        organizationId,
        planId: 'FREE',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private emit(event: ActivityEvent): void {
    this.events.emit(event.action, event);
  }
}
