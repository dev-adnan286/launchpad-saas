import { api } from './client';
import type { DashboardStats, OrgSummary, SuccessResponse } from './types';

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
}

export function listOrganizations(): Promise<OrgSummary[]> {
  return api.get<OrgSummary[]>('/organizations');
}

export function getOrganization(orgId: string): Promise<OrgSummary> {
  return api.get<OrgSummary>(`/organizations/${orgId}`);
}

export function createOrganization(input: CreateOrganizationInput): Promise<OrgSummary> {
  return api.post<OrgSummary>('/organizations', input);
}

export function updateOrganization(orgId: string, input: UpdateOrganizationInput): Promise<OrgSummary> {
  return api.patch<OrgSummary>(`/organizations/${orgId}`, input);
}

export function deleteOrganization(orgId: string): Promise<SuccessResponse> {
  return api.delete<SuccessResponse>(`/organizations/${orgId}`);
}

export function switchOrganization(orgId: string): Promise<OrgSummary> {
  return api.post<OrgSummary>(`/organizations/${orgId}/switch`, undefined, { orgId });
}

export function getOrganizationStats(orgId: string): Promise<DashboardStats> {
  return api.get<DashboardStats>(`/organizations/${orgId}/stats`, { orgId });
}
