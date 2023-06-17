import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Subscription } from '@prisma/client';
import { asPrismaService, createConfigMock, createEventsMock, createPrismaMock, createRedisMock, NOW, PrismaMock } from '../testing/mocks';
import { BillingService } from './billing.service';
import { FakePaymentProvider } from './payment-provider';
import { PlanLimitsService, planCacheKey } from './plan-limits.service';
import { PLAN_CATALOG, isUpgrade, listPlans } from './plans';
import { signWebhookPayload, verifyWebhookSignature } from './webhook-signature';

const ORG = 'org-1';
const SECRET = 'test-webhook-secret';

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    organizationId: ORG,
    planId: 'FREE',
    status: 'ACTIVE',
    externalId: null,
    currentPeriodStart: NOW,
    currentPeriodEnd: new Date(NOW.getTime() + 30 * 86_400_000),
    cancelAtPeriodEnd: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('webhook signature', () => {
  it('signs and verifies the raw body', () => {
    const body = Buffer.from('{"type":"payment.failed","data":{"externalId":"sub_1"}}');
    const header = signWebhookPayload(SECRET, body);
    expect(header.startsWith('sha256=')).toBe(true);
    expect(verifyWebhookSignature(SECRET, body, header)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets, malformed and missing headers', () => {
    const body = '{"a":1}';
    const header = signWebhookPayload(SECRET, body);
    expect(verifyWebhookSignature(SECRET, '{"a":2}', header)).toBe(false);
    expect(verifyWebhookSignature('other-secret', body, header)).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, header.replace('sha256=', 'md5='))).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, undefined)).toBe(false);
    expect(verifyWebhookSignature(SECRET, undefined, header)).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, 'sha256=short')).toBe(false);
  });
});

describe('plan catalog', () => {
  it('lists plans in ascending order with increasing limits', () => {
    const plans = listPlans();
    expect(plans.map((p) => p.id)).toEqual(['FREE', 'PRO', 'ENTERPRISE']);
    expect(plans[0].maxProjects).toBeLessThan(plans[1].maxProjects);
    expect(plans[1].maxMembers).toBeLessThan(plans[2].maxMembers);
    expect(isUpgrade('FREE', 'PRO')).toBe(true);
    expect(isUpgrade('PRO', 'FREE')).toBe(false);
  });
});

describe('PlanLimitsService', () => {
  let prisma: PrismaMock;
  let redis: ReturnType<typeof createRedisMock>;
  let limits: PlanLimitsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    redis = createRedisMock(true);
    limits = new PlanLimitsService(asPrismaService(prisma), redis.service);
  });

  it('caches the plan lookup in Redis', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ planId: 'PRO', status: 'ACTIVE' } as never);
    expect(await limits.getPlanId(ORG)).toBe('PRO');
    expect(await limits.getPlanId(ORG)).toBe('PRO');
    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(1);
    expect(redis.store.get(planCacheKey(ORG))).toBe('PRO');

    await limits.invalidate(ORG);
    expect(redis.store.has(planCacheKey(ORG))).toBe(false);
  });

  it('falls back to FREE for missing or canceled subscriptions', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    expect(await limits.getPlanId('no-sub')).toBe('FREE');
    prisma.subscription.findUnique.mockResolvedValue({ planId: 'PRO', status: 'CANCELED' } as never);
    expect(await limits.getPlanId('canceled')).toBe('FREE');
  });

  it('assertCanAddProject enforces maxProjects on active projects', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ planId: 'FREE', status: 'ACTIVE' } as never);
    prisma.project.count.mockResolvedValue(3);
    await expect(limits.assertCanAddProject(ORG)).rejects.toBeInstanceOf(ConflictException);
    prisma.project.count.mockResolvedValue(2);
    await expect(limits.assertCanAddProject(ORG)).resolves.toBeUndefined();
  });

  it('assertUsageFits reports every violated limit', () => {
    expect(() => limits.assertUsageFits(PLAN_CATALOG.FREE, { projects: 10, members: 9 })).toThrow(/10 active projects.*9 members/);
    expect(() => limits.assertUsageFits(PLAN_CATALOG.PRO, { projects: 10, members: 9 })).not.toThrow();
  });
});

describe('BillingService', () => {
  let prisma: PrismaMock;
  let service: BillingService;
  let events: ReturnType<typeof createEventsMock>;
  let provider: FakePaymentProvider;

  beforeEach(() => {
    prisma = createPrismaMock();
    events = createEventsMock();
    provider = new FakePaymentProvider();
    const limits = new PlanLimitsService(asPrismaService(prisma), createRedisMock(false).service);
    service = new BillingService(asPrismaService(prisma), limits, events, provider, createConfigMock({ BILLING_WEBHOOK_SECRET: SECRET }));
  });

  it('getOverview returns plan, subscription and usage', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscription({ planId: 'PRO' }));
    prisma.project.count.mockResolvedValue(4);
    prisma.membership.count.mockResolvedValue(6);
    const overview = await service.getOverview(ORG);
    expect(overview.plan.id).toBe('PRO');
    expect(overview.usage).toEqual({ projects: 4, members: 6 });
  });

  it('creates a FREE subscription on demand for legacy orgs', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({ id: ORG } as never);
    prisma.subscription.create.mockResolvedValue(subscription());
    prisma.project.count.mockResolvedValue(0);
    prisma.membership.count.mockResolvedValue(1);
    const overview = await service.getOverview(ORG);
    expect(overview.plan.id).toBe('FREE');
    expect(prisma.subscription.create).toHaveBeenCalled();
  });

  it('upgrades through the payment provider and stores the external id', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscription());
    prisma.project.count.mockResolvedValue(2);
    prisma.membership.count.mockResolvedValue(3);
    const spy = jest.spyOn(provider, 'createSubscription');
    prisma.subscription.update.mockImplementation((args) => Promise.resolve(subscription(args.data as object)) as never);

    const result = await service.changePlan(ORG, 'owner-1', 'PRO');

    expect(spy).toHaveBeenCalledWith(ORG, 'PRO');
    expect(result.subscription.planId).toBe('PRO');
    expect(result.subscription.externalId).toMatch(/^sub_/);
    expect(events.emit).toHaveBeenCalledWith('subscription.plan_changed', expect.objectContaining({ metadata: { from: 'FREE', to: 'PRO' } }));
  });

  it('refuses a downgrade when usage exceeds the target plan (409)', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscription({ planId: 'PRO', externalId: 'sub_x' }));
    prisma.project.count.mockResolvedValue(7);
    prisma.membership.count.mockResolvedValue(2);

    await expect(service.changePlan(ORG, 'owner-1', 'FREE')).rejects.toThrow(/7 active projects exceed the Free limit/);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('allows a downgrade when usage fits, using changePlan on the provider', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscription({ planId: 'PRO', externalId: 'sub_x' }));
    prisma.project.count.mockResolvedValue(1);
    prisma.membership.count.mockResolvedValue(2);
    const spy = jest.spyOn(provider, 'changePlan');
    prisma.subscription.update.mockImplementation((args) => Promise.resolve(subscription(args.data as object)) as never);

    const result = await service.changePlan(ORG, 'owner-1', 'FREE');
    expect(spy).toHaveBeenCalledWith('sub_x', 'FREE');
    expect(result.plan.id).toBe('FREE');
  });

  it('is idempotent when already on the requested plan', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscription({ planId: 'PRO' }));
    prisma.project.count.mockResolvedValue(0);
    prisma.membership.count.mockResolvedValue(1);
    await service.changePlan(ORG, 'owner-1', 'PRO');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  describe('handleWebhook', () => {
    const event = { type: 'payment.failed' as const, data: { externalId: 'sub_x' } };
    const raw = Buffer.from(JSON.stringify(event));

    it('rejects invalid signatures before touching the database', async () => {
      await expect(service.handleWebhook(raw, 'sha256=bad', event)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('marks the subscription PAST_DUE on payment.failed', async () => {
      prisma.subscription.findFirst.mockResolvedValue(subscription({ externalId: 'sub_x', planId: 'PRO' }));
      prisma.subscription.update.mockResolvedValue(subscription({ status: 'PAST_DUE' }));
      await service.handleWebhook(raw, signWebhookPayload(SECRET, raw), event);
      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { status: 'PAST_DUE' } });
      expect(events.emit).toHaveBeenCalledWith('subscription.payment_failed', expect.anything());
    });

    it('applies plan and period on subscription.updated', async () => {
      const update = {
        type: 'subscription.updated' as const,
        data: { externalId: 'sub_x', planId: 'ENTERPRISE' as const, currentPeriodEnd: '2027-01-01T00:00:00.000Z' },
      };
      const body = Buffer.from(JSON.stringify(update));
      prisma.subscription.findFirst.mockResolvedValue(subscription({ externalId: 'sub_x' }));
      prisma.subscription.update.mockResolvedValue(subscription({ planId: 'ENTERPRISE' }));
      await service.handleWebhook(body, signWebhookPayload(SECRET, body), update);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { planId: 'ENTERPRISE', status: 'ACTIVE', currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z') },
      });
    });

    it('ignores events for unknown subscriptions', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      await expect(service.handleWebhook(raw, signWebhookPayload(SECRET, raw), event)).resolves.toBeUndefined();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });
});
