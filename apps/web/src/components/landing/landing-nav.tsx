'use client';

import Link from 'next/link';
import { Rocket } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { buttonVariants } from '@/components/ui/button';

export function LandingNav() {
  const { isAuthenticated, loading } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Rocket className="h-4 w-4" aria-hidden="true" />
          </span>
          LaunchPad
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex" aria-label="Primary">
          <Link href="#features" className="hover:text-slate-900">
            Features
          </Link>
          <Link href="#pricing" className="hover:text-slate-900">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {!loading && isAuthenticated ? (
            <Link href="/app" className={buttonVariants({ size: 'sm' })}>
              Open app
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Sign in
              </Link>
              <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
