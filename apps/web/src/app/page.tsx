import Link from 'next/link';
import { Activity, KanbanSquare, KeyRound, Shield, Users, Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PricingSection } from '@/components/landing/pricing-section';
import { LandingNav } from '@/components/landing/landing-nav';

const FEATURES = [
  {
    icon: KanbanSquare,
    title: 'Kanban and list views',
    description: 'Drag tasks across status columns with validated transitions, or switch to a filterable, sortable list.',
  },
  {
    icon: Users,
    title: 'Workspaces and roles',
    description: 'Invite teammates by email and control access with Owner, Admin, Member and Viewer roles.',
  },
  {
    icon: Activity,
    title: 'Activity feed',
    description: 'Every change is recorded. See who did what, when, across every project in the organization.',
  },
  {
    icon: KeyRound,
    title: 'API keys',
    description: 'Automate anything with scoped API keys. Keys are hashed at rest and revealed exactly once.',
  },
  {
    icon: Shield,
    title: 'Secure by default',
    description: 'Short-lived access tokens, rotating refresh tokens with reuse detection, and per-tenant isolation.',
  },
  {
    icon: Zap,
    title: 'Plans that grow with you',
    description: 'Start free, upgrade when you need more projects, members and integrations.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNav />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-100 via-white to-white" />
          <div className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center sm:pt-32">
            <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              Built for B2B teams
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
              Plan, track and ship work in one shared workspace
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
              LaunchPad gives every organization its own space with projects, tasks, comments, labels and an
              audit-ready activity feed. Invite your team in seconds.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}>
                Start for free
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full sm:w-auto')}
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-slate-100 bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">Everything a team needs</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
              Opinionated defaults, no configuration marathon. Create an organization and start adding work.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-600">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PricingSection />

        <section className="border-t border-slate-100 py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Ready to launch?</h2>
            <p className="mt-3 text-slate-600">Create your workspace now. No credit card required on the Free plan.</p>
            <div className="mt-8">
              <Link href="/register" className={buttonVariants({ size: 'lg' })}>
                Create your organization
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-slate-500 sm:flex-row">
          <p>LaunchPad. Built with Next.js and NestJS.</p>
          <nav className="flex gap-4">
            <Link href="#features" className="hover:text-slate-900">
              Features
            </Link>
            <Link href="#pricing" className="hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-slate-900">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
