import { api, type Envelope } from './client';
import type { Activity } from './types';

export interface ActivityFilters {
  projectId?: string;
  page?: number;
  pageSize?: number;
}

export function listActivity(filters: ActivityFilters = {}): Promise<Envelope<Activity[]>> {
  return api.getPaginated<Activity>('/activity', {
    query: { projectId: filters.projectId, page: filters.page, pageSize: filters.pageSize },
  });
}
