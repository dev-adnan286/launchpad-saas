import { api } from './client';
import type { BillingOverview, Plan, PlanId } from './types';

/** Static catalog used as a fallback when the API is unreachable (e.g. landing page). */
export const PLAN_CATALOG: Plan[] = [
  {
    id: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    maxProjects: 3,
    maxMembers: 5,
    features: ['Up to 3 projects', 'Up to 5 members', 'Kanban & list views', 'Community support'],
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceMonthly: 1900,
    maxProjects: 25,
    maxMembers: 25,
    features: ['Up to 25 projects', 'Up to 25 members', 'API keys', 'Activity history', 'Priority support'],
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 9900,
    maxProjects: 1000,
    maxMembers: 1000,
    features: ['Unlimited projects', 'Unlimited members', 'API keys', 'SSO-ready', 'Dedicated support'],
  },
];

export const UNLIMITED_THRESHOLD = 1000;

export function formatLimit(value: number): string {
  return value >= UNLIMITED_THRESHOLD ? 'Unlimited' : String(value);
}

export function formatPrice(cents: number): string {
  if (cents === 0) return '$0';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function listPlans(): Promise<Plan[]> {
  return api.get<Plan[]>('/billing/plans', { anonymous: true, orgId: null });
}

export function getBilling(): Promise<BillingOverview> {
  return api.get<BillingOverview>('/billing');
}

export function changePlan(planId: PlanId): Promise<BillingOverview> {
  return api.post<BillingOverview>('/billing/change-plan', { planId });
}
