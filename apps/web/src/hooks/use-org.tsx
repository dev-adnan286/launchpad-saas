'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredOrgId, setStoredOrgId } from '@/lib/api/client';
import * as organizationsApi from '@/lib/api/organizations';
import type { MembershipRole, OrgSummary } from '@/lib/api/types';
import { useAuth } from './use-auth';

const ROLE_RANK: Record<MembershipRole, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

export function hasRole(role: MembershipRole | undefined, required: MembershipRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export interface OrgContextValue {
  orgs: OrgSummary[];
  currentOrg: OrgSummary | null;
  loading: boolean;
  error: string | null;
  switchOrg: (orgId: string) => Promise<OrgSummary | null>;
  refetch: () => Promise<void>;
  /** True when the current user's role is at least `required`. */
  can: (required: MembershipRole) => boolean;
}

const OrgContext = React.createContext<OrgContextValue | null>(null);

export const ORGS_QUERY_KEY = ['organizations'] as const;

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentOrgId, setCurrentOrgId] = React.useState<string | null>(() => getStoredOrgId());

  const orgsQuery = useQuery({
    queryKey: ORGS_QUERY_KEY,
    queryFn: organizationsApi.listOrganizations,
    enabled: user !== null,
    staleTime: 60_000,
  });

  const orgs = React.useMemo(() => orgsQuery.data ?? [], [orgsQuery.data]);

  // Ensure the selected org is one the user belongs to; fall back to the first.
  React.useEffect(() => {
    if (!orgsQuery.isSuccess) return;
    const stillMember = currentOrgId && orgs.some((org) => org.id === currentOrgId);
    if (stillMember) return;
    const fallback = orgs[0]?.id ?? null;
    setCurrentOrgId(fallback);
    setStoredOrgId(fallback);
  }, [orgsQuery.isSuccess, orgs, currentOrgId]);

  // Reset when the user logs out.
  React.useEffect(() => {
    if (user === null) setCurrentOrgId(null);
  }, [user]);

  const currentOrg = React.useMemo(
    () => orgs.find((org) => org.id === currentOrgId) ?? null,
    [orgs, currentOrgId],
  );

  const switchOrg = React.useCallback(
    async (orgId: string): Promise<OrgSummary | null> => {
      const org = await organizationsApi.switchOrganization(orgId);
      setStoredOrgId(org.id);
      setCurrentOrgId(org.id);
      // Everything org-scoped must be refetched under the new header.
      await queryClient.invalidateQueries();
      queryClient.setQueryData<OrgSummary[]>(ORGS_QUERY_KEY, (previous) => {
        if (!previous) return previous;
        const exists = previous.some((item) => item.id === org.id);
        return exists ? previous.map((item) => (item.id === org.id ? org : item)) : [...previous, org];
      });
      return org;
    },
    [queryClient],
  );

  const refetch = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ORGS_QUERY_KEY });
  }, [queryClient]);

  const can = React.useCallback(
    (required: MembershipRole) => hasRole(currentOrg?.role, required),
    [currentOrg],
  );

  const value = React.useMemo<OrgContextValue>(
    () => ({
      orgs,
      currentOrg,
      loading: user !== null && orgsQuery.isPending,
      error: orgsQuery.error ? orgsQuery.error.message : null,
      switchOrg,
      refetch,
      can,
    }),
    [orgs, currentOrg, user, orgsQuery.isPending, orgsQuery.error, switchOrg, refetch, can],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const context = React.useContext(OrgContext);
  if (!context) throw new Error('useOrg must be used within an OrgProvider');
  return context;
}
