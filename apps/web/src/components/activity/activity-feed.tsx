'use client';

import type { Activity } from '@/lib/api/types';
import { relativeTime } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/kanban';
import type { TaskStatus } from '@/lib/api/types';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Activity as ActivityIcon } from 'lucide-react';

function readString(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function statusLabel(value: string | null): string | null {
  if (!value) return null;
  return value in STATUS_LABELS ? STATUS_LABELS[value as TaskStatus] : value;
}

/** Turn an activity row into a human readable sentence (without the actor). */
export function describeActivity(item: Activity): string {
  const meta = item.metadata;
  const name = readString(meta, 'title') ?? readString(meta, 'name') ?? readString(meta, 'email');
  const target = name ? `"${name}"` : item.entityType.replace('_', ' ');
  const [, verb = item.action] = item.action.split('.');

  switch (item.action) {
    case 'task.status_changed': {
      const from = statusLabel(readString(meta, 'from'));
      const to = statusLabel(readString(meta, 'to'));
      return from && to ? `moved task ${target} from ${from} to ${to}` : `changed the status of task ${target}`;
    }
    case 'task.assigned': {
      const assignee = readString(meta, 'assigneeName');
      return assignee ? `assigned task ${target} to ${assignee}` : `unassigned task ${target}`;
    }
    case 'task.reordered':
      return `reordered task ${target}`;
    case 'member.role_changed': {
      const role = readString(meta, 'role');
      return role ? `changed a member's role to ${role}` : 'changed a member role';
    }
    case 'subscription.plan_changed': {
      const plan = readString(meta, 'planId') ?? readString(meta, 'to');
      return plan ? `switched the plan to ${plan}` : 'changed the subscription plan';
    }
    default: {
      const readable = verb.replace(/_/g, ' ');
      return `${readable} ${item.entityType.replace('_', ' ')} ${name ? target : ''}`.trim();
    }
  }
}

export function ActivityFeed({
  items,
  loading,
  error,
  onRetry,
}: {
  items: Activity[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading) {
    return (
      <ul className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={index} className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ActivityIcon className="h-5 w-5" aria-hidden="true" />}
        title="No activity yet"
        description="Actions across projects, tasks and members will show up here."
        className="py-8"
      />
    );
  }
  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <Avatar name={item.actor?.name ?? 'System'} src={item.actor?.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{item.actor?.name ?? 'System'}</span> {describeActivity(item)}
            </p>
            <time dateTime={item.createdAt} className="text-xs text-slate-500">
              {relativeTime(item.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
