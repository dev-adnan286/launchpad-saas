'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import * as projectsApi from '@/lib/api/projects';
import * as billingApi from '@/lib/api/billing';
import { getErrorMessage } from '@/lib/api/client';
import type { Project } from '@/lib/api/types';
import { formatDate, percent } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProjectDialog } from '@/components/projects/project-dialog';

export default function ProjectsPage() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showArchived, setShowArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<Project | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Project | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects', orgId, showArchived],
    queryFn: () => projectsApi.listProjects(showArchived),
    enabled: Boolean(orgId),
  });

  const billingQuery = useQuery({
    queryKey: ['billing', orgId],
    queryFn: billingApi.getBilling,
    enabled: Boolean(orgId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['projects', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['billing', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['org-stats', orgId] });
  };

  const archiveMutation = useMutation({
    mutationFn: (project: Project) =>
      project.archivedAt ? projectsApi.unarchiveProject(project.id) : projectsApi.archiveProject(project.id),
    onSuccess: (project) => {
      toast({ title: project.archivedAt ? 'Project archived' : 'Project restored', variant: 'success' });
      invalidate();
    },
    onError: (error) => toast({ title: 'Action failed', description: getErrorMessage(error), variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (project: Project) => projectsApi.deleteProject(project.id),
    onSuccess: () => {
      toast({ title: 'Project deleted', variant: 'success' });
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast({ title: 'Delete failed', description: getErrorMessage(error), variant: 'error' }),
  });

  const projects = projectsQuery.data ?? [];
  const activeCount = projects.filter((project) => !project.archivedAt).length;
  const plan = billingQuery.data?.plan;
  const usedProjects = billingQuery.data?.usage.projects ?? activeCount;
  const atLimit = plan ? usedProjects >= plan.maxProjects : false;
  const canEdit = can('MEMBER');
  const canDelete = can('ADMIN');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            {plan ? `${usedProjects} of ${billingApi.formatLimit(plan.maxProjects)} projects used on the ${plan.name} plan.` : 'Organize work into projects.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
          {canEdit && (
            <Button onClick={() => setCreating(true)} disabled={atLimit}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New project
            </Button>
          )}
        </div>
      </div>

      {atLimit && plan && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>
            You have reached the {plan.name} plan limit of {plan.maxProjects} active projects. Archive a project or upgrade to
            add more.
          </span>
          <Link href="/app/settings?tab=billing" className="font-medium underline underline-offset-2">
            View plans
          </Link>
        </div>
      )}

      {projectsQuery.isError ? (
        <ErrorState message={getErrorMessage(projectsQuery.error)} onRetry={() => void projectsQuery.refetch()} />
      ) : projectsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" aria-hidden="true" />}
          title={showArchived ? 'No projects' : 'No active projects'}
          description="Projects group related tasks. Create one to start planning work."
          action={
            canEdit ? (
              <Button onClick={() => setCreating(true)} disabled={atLimit}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const done = project.taskCounts.done;
            const total = project.taskCounts.total;
            const progress = percent(done, total);
            return (
              <Card key={project.id} className="flex flex-col p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/app/projects/${project.id}`} className="flex min-w-0 items-center gap-3">
                    <span
                      className="inline-block h-9 w-9 shrink-0 rounded-lg"
                      style={{ backgroundColor: project.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold text-slate-900 hover:text-brand-700">
                        {project.name}
                      </span>
                      <span className="block text-xs text-slate-500">Created {formatDate(project.createdAt)}</span>
                    </span>
                  </Link>
                  {(canEdit || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                          aria-label={`Actions for ${project.name}`}
                        >
                          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <>
                            <DropdownMenuItem onSelect={() => setEditing(project)}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => archiveMutation.mutate(project)}
                              disabled={Boolean(project.archivedAt) && atLimit}
                            >
                              {project.archivedAt ? (
                                <>
                                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                                  Restore
                                </>
                              ) : (
                                <>
                                  <Archive className="h-4 w-4" aria-hidden="true" />
                                  Archive
                                </>
                              )}
                            </DropdownMenuItem>
                          </>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setDeleting(project)}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-slate-600">
                  {project.description || 'No description.'}
                </p>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {done} / {total} tasks done
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                {project.archivedAt && (
                  <div className="mt-3">
                    <Badge variant="warning">Archived {formatDate(project.archivedAt)}</Badge>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ProjectDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        project={editing}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? 'project'}?`}
        description="All tasks, comments and activity in this project will be permanently removed. This cannot be undone."
        confirmLabel="Delete project"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting);
        }}
      />
    </div>
  );
}
