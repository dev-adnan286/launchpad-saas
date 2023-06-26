import { PlanId } from '@prisma/client';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceMonthly: number;
  maxProjects: number;
  maxMembers: number;
  features: string[];
}

/**
 * Canonical plan catalog. The database `plans` table is seeded from this list and the
 * BillingService reads limits from here so limit enforcement never depends on Redis/DB state.
 */
export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    maxProjects: 3,
    maxMembers: 5,
    features: ['Up to 3 projects', 'Up to 5 members', 'Kanban & list views', 'Community support'],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    priceMonthly: 1900,
    maxProjects: 25,
    maxMembers: 25,
    features: ['Up to 25 projects', 'Up to 25 members', 'API keys', 'Activity history', 'Priority support'],
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 9900,
    maxProjects: 1000,
    maxMembers: 1000,
    features: ['Unlimited projects', 'Unlimited members', 'API keys', 'SSO-ready', 'Dedicated support'],
  },
};

export const PLAN_ORDER: PlanId[] = ['FREE', 'PRO', 'ENTERPRISE'];

export function listPlans(): PlanDefinition[] {
  return PLAN_ORDER.map((id) => PLAN_CATALOG[id]);
}

export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}
