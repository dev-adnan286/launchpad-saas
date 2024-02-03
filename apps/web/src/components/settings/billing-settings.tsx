'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import * as billingApi from '@/lib/api/billing';
import { getErrorMessage } from '@/lib/api/client';
import type { Plan, PlanId } from '@/lib/api/types';
import { cn, formatDate, percent } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/dialog';

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const value = percent(used, limit);
  const unlimited = limit >= billingApi.UNLIMITED_THRESHOLD;
  const tone = value >= 100 ? 'bg-rose-500' : value >= 80 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-medium tabular-nums text-slate-900">
          {used} / {billingApi.formatLimit(limit)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          role="progressbar"
          aria-label={`${label} usage`}
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          className={cn('h-full rounded-full transition-all', unlimited ? 'bg-brand-300' : tone)}
          style={{ width: `${unlimited ? Math.min(value, 5) : value}%` }}
        />
      </div>
    </div>
  );
}

export function BillingSettings() {
  const { currentOrg, can, refetch: refetchOrgs } = useOrg();
  const orgId = currentOrg?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingPlan, setPendingPlan] = React.useState<Plan | null>(null);
  const isOwner = can('OWNER');

  const billingQuery = useQuery({ queryKey: ['billing', orgId], queryFn: billingApi.getBilling, enabled: Boolean(orgId) });
  const plansQuery = useQuery({ queryKey: ['plans'], queryFn: billingApi.listPlans, staleTime: 5 * 60_000 });

  const change = useMutation({
    mutationFn: (planId: PlanId) => billingApi.changePlan(planId),
    onSuccess: async (overview) => {
      queryClient.setQueryData(['billing', orgId], overview);
      toast({ title: `Switched to ${overview.plan.name}`, variant: 'success' });
      setPendingPlan(null);
      await refetchOrgs();
      void queryClient.invalidateQueries({ queryKey: ['projects', orgId] });
    },
    onError: (error) => {
      toast({ title: 'Plan change failed', description: getErrorMessage(error), variant: 'error' });
      setPendingPlan(null);
    },
  });

  if (billingQuery.isError) {
    return <ErrorState message={getErrorMessage(billingQuery.error)} onRetry={() => void billingQuery.refetch()} />;
  }

  const overview = billingQuery.data;
  const plans = plansQuery.data ?? billingApi.PLAN_CATALOG;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>Usage against the limits of your subscription.</CardDescription>
        </CardHeader>
        <CardContent>
          {!overview ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-2xl font-semibold text-slate-900">{overview.plan.name}</span>
                <Badge variant={overview.subscription.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {overview.subscription.status.replace('_', ' ')}
                </Badge>
                <span className="text-sm text-slate-500">
                  {billingApi.formatPrice(overview.plan.priceMonthly)} / month. Renews {formatDate(overview.subscription.currentPeriodEnd)}.
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <UsageBar label="Active projects" used={overview.usage.projects} limit={overview.plan.maxProjects} />
                <UsageBar label="Members" used={overview.usage.members} limit={overview.plan.maxMembers} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const current = overview?.plan.id === plan.id;
          const exceeds =
            overview !== undefined &&
            (overview.usage.projects > plan.maxProjects || overview.usage.members > plan.maxMembers);
          return (
            <Card key={plan.id} className={cn('flex flex-col p-6', current && 'border-brand-500 ring-2 ring-brand-500/20')}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                {current && <Badge variant="brand">Current</Badge>}
              </div>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900">{billingApi.formatPrice(plan.priceMonthly)}</span>
                <span className="text-sm text-slate-500">/ month</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {billingApi.formatLimit(plan.maxProjects)} projects, {billingApi.formatLimit(plan.maxMembers)} members
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6"
                variant={current ? 'secondary' : 'primary'}
                disabled={current || !isOwner || exceeds || !overview}
                onClick={() => setPendingPlan(plan)}
              >
                {current ? 'Current plan' : `Switch to ${plan.name}`}
              </Button>
              {exceeds && !current && (
                <p className="mt-2 text-xs text-amber-700">Current usage exceeds this plan&apos;s limits.</p>
              )}
              {!isOwner && !current && <p className="mt-2 text-xs text-slate-500">Only the owner can change the plan.</p>}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingPlan !== null}
        onOpenChange={(open) => !open && setPendingPlan(null)}
        title={`Switch to ${pendingPlan?.name ?? ''}?`}
        description={
          pendingPlan
            ? `Your organization will move to the ${pendingPlan.name} plan at ${billingApi.formatPrice(pendingPlan.priceMonthly)} per month with ${billingApi.formatLimit(pendingPlan.maxProjects)} projects and ${billingApi.formatLimit(pendingPlan.maxMembers)} members.`
            : ''
        }
        confirmLabel="Confirm change"
        loading={change.isPending}
        onConfirm={() => {
          if (pendingPlan) change.mutate(pendingPlan.id);
        }}
      />
    </div>
  );
}
