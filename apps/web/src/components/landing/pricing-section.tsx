'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { PLAN_CATALOG, formatLimit, formatPrice, listPlans } from '@/lib/api/billing';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PricingSection() {
  const plansQuery = useQuery({
    queryKey: ['public-plans'],
    queryFn: listPlans,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const plans = plansQuery.data && plansQuery.data.length > 0 ? plansQuery.data : PLAN_CATALOG;

  return (
    <section id="pricing" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">Simple, predictable pricing</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          Every plan includes unlimited tasks, comments and labels. Upgrade for more projects and seats.
        </p>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const highlighted = plan.id === 'PRO';
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-white p-8 shadow-sm',
                  highlighted ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200',
                )}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">{formatPrice(plan.priceMonthly)}</span>
                  <span className="text-sm text-slate-500">/ month</span>
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {formatLimit(plan.maxProjects)} projects, {formatLimit(plan.maxMembers)} members
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={cn(
                    buttonVariants({ variant: highlighted ? 'primary' : 'secondary' }),
                    'mt-8 w-full',
                  )}
                >
                  {plan.id === 'FREE' ? 'Start for free' : `Choose ${plan.name}`}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
