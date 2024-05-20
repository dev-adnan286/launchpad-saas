import { api, type Envelope } from './client';
import type { Task, TaskPriority, TaskStatus } from './types';

export type TaskSortBy = 'createdAt' | 'dueDate' | 'priority' | 'position' | 'title';
export type SortOrder = 'asc' | 'desc';

export interface TaskFilters {
  status?: TaskStatus | '';
  priority?: TaskPriority | '';
  assigneeId?: string;
  labelId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: TaskSortBy;
  sortOrder?: SortOrder;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
  labelIds?: string[];
}

export interface ReorderInput {
  taskId: string;
  toStatus: TaskStatus;
  toIndex: number;
}

export interface BulkUpdateInput {
  taskIds: string[];
  data: { status?: TaskStatus; priority?: TaskPriority; assigneeId?: string | null };
}

export function listTasks(projectId: string, filters: TaskFilters = {}): Promise<Envelope<Task[]>> {
  return api.getPaginated<Task>(`/projects/${projectId}/tasks`, {
    query: {
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      assigneeId: filters.assigneeId || undefined,
      labelId: filters.labelId || undefined,
      search: filters.search || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    },
  });
}

/** Fetch every task of a project (used by the Kanban board). */
export async function listAllTasks(projectId: string): Promise<Task[]> {
  const pageSize = 100;
  const first = await listTasks(projectId, { page: 1, pageSize, sortBy: 'position', sortOrder: 'asc' });
  const tasks = [...first.data];
  const totalPages = first.meta?.totalPages ?? 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await listTasks(projectId, { page, pageSize, sortBy: 'position', sortOrder: 'asc' });
    tasks.push(...next.data);
  }
  return tasks;
}

export function getTask(taskId: string): Promise<Task> {
  return api.get<Task>(`/tasks/${taskId}`);
}

export function createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
  return api.post<Task>(`/projects/${projectId}/tasks`, input);
}

export function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  return api.patch<Task>(`/tasks/${taskId}`, input);
}

export function deleteTask(taskId: string): Promise<{ success: boolean }> {
  return api.delete<{ success: boolean }>(`/tasks/${taskId}`);
}

export function changeTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
  return api.post<Task>(`/tasks/${taskId}/status`, { status });
}

export function assignTask(taskId: string, assigneeId: string | null): Promise<Task> {
  return api.post<Task>(`/tasks/${taskId}/assign`, { assigneeId });
}

export function reorderTask(input: ReorderInput): Promise<Task[]> {
  return api.post<Task[]>('/tasks/reorder', input);
}

export function bulkUpdateTasks(input: BulkUpdateInput): Promise<{ updated: number }> {
  return api.post<{ updated: number }>('/tasks/bulk', input);
}
