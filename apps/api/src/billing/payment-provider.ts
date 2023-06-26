import { Injectable, Logger } from '@nestjs/common';
import { PlanId } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface ProviderSubscription {
  externalId: string;
  planId: PlanId;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * Abstraction over a payment processor. Real implementations (Stripe, Paddle...) would create
 * customers, checkout sessions and subscriptions; the app only depends on this contract.
 */
export interface PaymentProvider {
  readonly name: string;
  createSubscription(organizationId: string, planId: PlanId): Promise<ProviderSubscription>;
  changePlan(externalId: string, planId: PlanId): Promise<ProviderSubscription>;
  cancelSubscription(externalId: string): Promise<void>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

const PERIOD_DAYS = 30;

/** In-memory provider used for local development, tests and demos. Never charges anything. */
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  private readonly logger = new Logger(FakePaymentProvider.name);
  private readonly subscriptions = new Map<string, ProviderSubscription>();

  async createSubscription(organizationId: string, planId: PlanId): Promise<ProviderSubscription> {
    const subscription = this.buildPeriod(`sub_${randomUUID().replace(/-/g, '').slice(0, 20)}`, planId);
    this.subscriptions.set(subscription.externalId, subscription);
    this.logger.log(`Created ${planId} subscription ${subscription.externalId} for org ${organizationId}`);
    return subscription;
  }

  async changePlan(externalId: string, planId: PlanId): Promise<ProviderSubscription> {
    const existing = this.subscriptions.get(externalId);
    const updated = existing
      ? { ...existing, planId }
      : this.buildPeriod(externalId, planId);
    this.subscriptions.set(externalId, updated);
    this.logger.log(`Subscription ${externalId} moved to ${planId}`);
    return updated;
  }

  async cancelSubscription(externalId: string): Promise<void> {
    this.subscriptions.delete(externalId);
    this.logger.log(`Subscription ${externalId} canceled`);
  }

  private buildPeriod(externalId: string, planId: PlanId): ProviderSubscription {
    const start = new Date();
    const end = new Date(start.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000);
    return { externalId, planId, currentPeriodStart: start, currentPeriodEnd: end };
  }
}
