'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, LayoutDashboard, Rocket, Settings, UserCircle, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrg } from '@/hooks/use-org';
import { Badge } from '@/components/ui/badge';

const NAV = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/projects', label: 'Projects', icon: FolderKanban, exact: false },
  { href: '/app/members', label: 'Members', icon: Users, exact: false },
  { href: '/app/settings', label: 'Settings', icon: Settings, exact: false },
  { href: '/app/profile', label: 'Profile', icon: UserCircle, exact: false },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { currentOrg } = useOrg();

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <Link href="/app" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Rocket className="h-4 w-4" aria-hidden="true" />
          </span>
          LaunchPad
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Workspace">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {currentOrg && (
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Current plan</p>
          <div className="mt-2 flex items-center justify-between">
            <Badge variant="brand">{currentOrg.plan}</Badge>
            <Link href="/app/settings?tab=billing" className="text-xs font-medium text-brand-600 hover:underline">
              Manage
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white lg:block">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            onClick={onClose}
            aria-label="Close menu overlay"
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
}
