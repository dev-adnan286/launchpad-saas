'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import { useToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { CreateOrgDialog } from './create-org-dialog';

export function OrgSwitcher() {
  const { orgs, currentOrg, switchOrg } = useOrg();
  const { toast } = useToast();
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrg?.id) return;
    setSwitching(true);
    try {
      await switchOrg(orgId);
      router.push('/app');
    } catch (error) {
      toast({ title: 'Could not switch organization', description: getErrorMessage(error), variant: 'error' });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={switching}
            className="flex max-w-xs items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
            aria-label="Switch organization"
          >
            <Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="truncate">{currentOrg?.name ?? 'Select organization'}</span>
            <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {orgs.map((org) => (
            <DropdownMenuItem key={org.id} onSelect={() => void handleSwitch(org.id)} className="justify-between">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{org.name}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {org.role}
                </Badge>
              </span>
              {org.id === currentOrg?.id && <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} hideTrigger />
    </>
  );
}
