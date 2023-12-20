'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, KanbanSquare, List, Plus } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import * as projectsApi from '@/lib/api/projects';
import * as membersApi from '@/lib/api/members';
import * as labelsApi from '@/lib/api/labels';
import { getErrorMessage } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { KanbanBoard } from '@/components/board/kanban-board';
import { TaskList } from '@/components/board/task-list';
import { TaskDrawer } from '@/components/board/task-drawer';
import { TaskCreateDialog } from '@/components/board/task-create-dialog';

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.id ?? '';
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [view, setView] = React.useState<'board' | 'list'>('board');

  const projectQuery = useQuery({
    queryKey: ['project', orgId, projectId],
    queryFn: () => projectsApi.getProject(projectId),
    enabled: Boolean(orgId && projectId),
  });
  const membersQuery = useQuery({
    queryKey: ['members', orgId],
    queryFn: membersApi.listMembers,
    enabled: Boolean(orgId),
  });
  const labelsQuery = useQuery({
    queryKey: ['labels', orgId],
    queryFn: labelsApi.listLabels,
    enabled: Boolean(orgId),
  });

  const project = projectQuery.data;
  const members = React.useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const labels = React.useMemo(() => labelsQuery.data ?? [], [labelsQuery.data]);
  const canEdit = can('MEMBER') && !project?.archivedAt;

  if (projectQuery.isError) {
    return <ErrorState message={getErrorMessage(projectQuery.error)} onRetry={() => void projectQuery.refetch()} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/app/projects" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Projects
          </Link>
          {project ? (
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-block h-8 w-8 shrink-0 rounded-lg" style={{ backgroundColor: project.color }} aria-hidden="true" />
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
                {project.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{project.description}</p>}
              </div>
              {project.archivedAt && <Badge variant="warning">Archived</Badge>}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-80" />
            </div>
          )}
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New task
          </Button>
        )}
      </div>

      <Tabs value={view} onValueChange={(value) => setView(value === 'list' ? 'list' : 'board')}>
        <TabsList aria-label="View">
          <TabsTrigger value="board">
            <KanbanSquare className="h-4 w-4" aria-hidden="true" />
            Board
          </TabsTrigger>
          <TabsTrigger value="list">
            <List className="h-4 w-4" aria-hidden="true" />
            List
          </TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <KanbanBoard projectId={projectId} canEdit={canEdit} onOpenTask={setSelectedTaskId} />
        </TabsContent>
        <TabsContent value="list">
          <TaskList projectId={projectId} members={members} labels={labels} onOpenTask={setSelectedTaskId} />
        </TabsContent>
      </Tabs>

      <TaskDrawer
        taskId={selectedTaskId}
        projectId={projectId}
        members={members}
        labels={labels}
        canEdit={canEdit}
        canModerate={can('ADMIN')}
        onClose={() => setSelectedTaskId(null)}
      />

      <TaskCreateDialog
        open={creating}
        onOpenChange={setCreating}
        projectId={projectId}
        members={members}
        labels={labels}
      />
    </div>
  );
}
