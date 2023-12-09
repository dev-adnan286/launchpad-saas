'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FolderKanban, ListTodo, Users } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import * as organizationsApi from '@/lib/api/organizations';
import * as activityApi from '@/lib/api/activity';
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from '@/lib/kanban';
import { getErrorMessage } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { ActivityFeed } from '@/components/activity/activity-feed';

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id ?? '';

  const statsQuery = useQuery({
    queryKey: ['org-stats', orgId],
    queryFn: () => organizationsApi.getOrganizationStats(orgId),
    enabled: Boolean(orgId),
  });

  const activityQuery = useQuery({
    queryKey: ['activity', orgId, 'recent'],
    queryFn: () => activityApi.listActivity({ page: 1, pageSize: 12 }),
    enabled: Boolean(orgId),
  });

  const stats = statsQuery.data;
  const totalTasks = stats?.tasks.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of <span className="font-medium text-slate-700">{currentOrg?.name}</span>.
        </p>
      </div>

      {statsQuery.isError ? (
        <ErrorState message={getErrorMessage(statsQuery.error)} onRetry={() => void statsQuery.refetch()} />
      ) : statsQuery.isPending || !stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active projects"
            value={stats.projects}
            icon={<FolderKanban className="h-5 w-5" aria-hidden="true" />}
            accent="brand"
          />
          <StatCard
            label="Open tasks"
            value={stats.tasks.open}
            hint={`${stats.tasks.total} total`}
            icon={<ListTodo className="h-5 w-5" aria-hidden="true" />}
            accent="sky"
          />
          <StatCard
            label="Completed"
            value={stats.tasks.done}
            hint={totalTasks > 0 ? `${Math.round((stats.tasks.done / totalTasks) * 100)}% of all tasks` : undefined}
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            accent="emerald"
          />
          <StatCard
            label="Overdue"
            value={stats.tasks.overdue}
            icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            accent={stats.tasks.overdue > 0 ? 'rose' : 'amber'}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tasks by status</CardTitle>
          </CardHeader>
          <CardContent>
            {statsQuery.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-5" />
                ))}
              </div>
            ) : stats ? (
              <ul className="space-y-3">
                {STATUS_ORDER.map((status) => {
                  const count = stats.tasksByStatus[status] ?? 0;
                  const width = totalTasks > 0 ? Math.max(2, Math.round((count / totalTasks) * 100)) : 0;
                  return (
                    <li key={status}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`} aria-hidden="true" />
                          {STATUS_LABELS[status]}
                        </span>
                        <span className="font-medium tabular-nums text-slate-900">{count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${STATUS_COLORS[status]}`}
                          style={{ width: `${width}%` }}
                          role="progressbar"
                          aria-valuenow={count}
                          aria-valuemin={0}
                          aria-valuemax={totalTasks}
                          aria-label={`${STATUS_LABELS[status]}: ${count} tasks`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <Users className="h-4 w-4" aria-hidden="true" />
                {stats?.members ?? currentOrg?.memberCount ?? 0} members
              </span>
              <Link href="/app/members" className="font-medium text-brand-600 hover:underline">
                Manage
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Link href="/app/projects" className="text-sm font-medium text-brand-600 hover:underline">
              View projects
            </Link>
          </CardHeader>
          <CardContent>
            <ActivityFeed
              items={activityQuery.data?.data ?? []}
              loading={activityQuery.isPending}
              error={activityQuery.isError ? getErrorMessage(activityQuery.error) : null}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
