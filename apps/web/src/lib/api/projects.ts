import { api } from './client';
import type { Project, SuccessResponse } from './types';

export interface ProjectInput {
  name: string;
  description?: string | null;
  color?: string;
}

export function listProjects(includeArchived = false): Promise<Project[]> {
  return api.get<Project[]>('/projects', { query: { includeArchived } });
}

export function getProject(id: string): Promise<Project> {
  return api.get<Project>(`/projects/${id}`);
}

export function createProject(input: ProjectInput): Promise<Project> {
  return api.post<Project>('/projects', input);
}

export function updateProject(id: string, input: Partial<ProjectInput>): Promise<Project> {
  return api.patch<Project>(`/projects/${id}`, input);
}

export function archiveProject(id: string): Promise<Project> {
  return api.post<Project>(`/projects/${id}/archive`);
}

export function unarchiveProject(id: string): Promise<Project> {
  return api.post<Project>(`/projects/${id}/unarchive`);
}

export function deleteProject(id: string): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/projects/${id}`);
}
