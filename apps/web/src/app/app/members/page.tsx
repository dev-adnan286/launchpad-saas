'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, UserMinus, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useOrg } from '@/hooks/use-org';
import * as membersApi from '@/lib/api/members';
import * as invitationsApi from '@/lib/api/invitations';
import * as billingApi from '@/lib/api/billing';
import { getErrorMessage } from '@/lib/api/client';
import type { Member, MembershipRole } from '@/lib/api/types';
import { MEMBERSHIP_ROLES } from '@/lib/api/types';
import { formatDate, relativeTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge, roleVariant } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/dialog';
import { InviteDialog } from '@/components/members/invite-dialog';

const ROLE_DESCRIPTIONS: Record<MembershipRole, string> = {
  OWNER: 'Full control including billing and deletion',
  ADMIN: 'Manage members, projects and settings',
  MEMBER: 'Create and edit projects and tasks',
  VIEWER: 'Read-only access',
};

export default function MembersPage() {
  const { user } = useAuth();
  const { currentOrg, can, refetch: refetchOrgs } = useOrg();
  const orgId = currentOrg?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<Member | null>(null);

  const isAdmin = can('ADMIN');
  const isOwner = can('OWNER');

  const membersQuery = useQuery({ queryKey: ['members', orgId], queryFn: membersApi.listMembers, enabled: Boolean(orgId) });
  const invitationsQuery = useQuery({
    queryKey: ['invitations', orgId],
    queryFn: invitationsApi.listInvitations,
    enabled: Boolean(orgId) && isAdmin,
  });
  const billingQuery = useQuery({ queryKey: ['billing', orgId], queryFn: billingApi.getBilling, enabled: Boolean(orgId) });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['invitations', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['billing', orgId] });
    void refetchOrgs();
  };

  const changeRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: MembershipRole }) => membersApi.changeMemberRole(memberId, role),
    onSuccess: () => {
      toast({ title: 'Role updated', variant: 'success' });
      invalidate();
    },
    onError: (error) => toast({ title: 'Could not change role', description: getErrorMessage(error), variant: 'error' }),
  });

  const removeMember = useMutation({
    mutationFn: (member: Member) => membersApi.removeMember(member.id),
    onSuccess: (_result, member) => {
      toast({ title: member.user.id === user?.id ? 'You left the organization' : 'Member removed', variant: 'success' });
      setRemoving(null);
      invalidate();
    },
    onError: (error) => toast({ title: 'Could not remove member', description: getErrorMessage(error), variant: 'error' }),
  });

  const revokeInvitation = useMutation({
    mutationFn: (id: string) => invitationsApi.revokeInvitation(id),
    onSuccess: () => {
      toast({ title: 'Invitation revoked', variant: 'success' });
      invalidate();
    },
    onError: (error) => toast({ title: 'Could not revoke invitation', description: getErrorMessage(error), variant: 'error' }),
  });

  const members = membersQuery.data ?? [];
  const pendingInvites = (invitationsQuery.data ?? []).filter((invite) => invite.status === 'PENDING');
  const plan = billingQuery.data?.plan;
  const seatsUsed = members.length + pendingInvites.length;
  const atLimit = plan ? seatsUsed >= plan.maxMembers : false;
  const ownerCount = members.filter((member) => member.role === 'OWNER').length;

  const roleOptionsFor = (member: Member): MembershipRole[] =>
    MEMBERSHIP_ROLES.filter((role) => (role === 'OWNER' ? isOwner || member.role === 'OWNER' : true));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Members</h1>
          <p className="mt-1 text-sm text-slate-500">
            {plan
              ? `${seatsUsed} of ${billingApi.formatLimit(plan.maxMembers)} seats used (members + pending invitations).`
              : 'People with access to this organization.'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Invite member
          </Button>
        )}
      </div>

      {atLimit && plan && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your {plan.name} plan allows {plan.maxMembers} members. Upgrade in Settings to invite more people.
        </div>
      )}

      {membersQuery.isError ? (
        <ErrorState message={getErrorMessage(membersQuery.error)} onRetry={() => void membersQuery.refetch()} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {membersQuery.isPending ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 4 }).map((__, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : members.length === 0 ? (
              <TableEmpty colSpan={4}>No members.</TableEmpty>
            ) : (
              members.map((member) => {
                const isSelf = member.user.id === user?.id;
                const lastOwner = member.role === 'OWNER' && ownerCount <= 1;
                const canChange = isAdmin && !lastOwner && (member.role !== 'OWNER' || isOwner);
                const canRemove = (isAdmin && !lastOwner && (member.role !== 'OWNER' || isOwner)) || (isSelf && !lastOwner);
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={member.user.name} src={member.user.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">
                            {member.user.name}
                            {isSelf && <span className="ml-1 text-xs text-slate-500">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500">{member.user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canChange ? (
                        <NativeSelect
                          aria-label={`Role for ${member.user.name}`}
                          value={member.role}
                          disabled={changeRole.isPending}
                          onChange={(event) => changeRole.mutate({ memberId: member.id, role: event.target.value as MembershipRole })}
                          title={ROLE_DESCRIPTIONS[member.role]}
                        >
                          {roleOptionsFor(member).map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <Badge variant={roleVariant(member.role)} title={ROLE_DESCRIPTIONS[member.role]}>
                          {member.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500">{formatDate(member.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {canRemove && (
                        <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setRemoving(member)}>
                          <UserMinus className="h-4 w-4" aria-hidden="true" />
                          {isSelf ? 'Leave' : 'Remove'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Invitations expire automatically. Revoke one to free its seat.</CardDescription>
          </CardHeader>
          <CardContent>
            {invitationsQuery.isPending ? (
              <Skeleton className="h-12 w-full" />
            ) : pendingInvites.length === 0 ? (
              <p className="text-sm text-slate-500">No pending invitations.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="rounded-full bg-slate-100 p-2 text-slate-500">
                        <Mail className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{invite.email}</p>
                        <p className="text-xs text-slate-500">
                          Invited by {invite.invitedBy.name} {relativeTime(invite.createdAt)}. Expires {formatDate(invite.expiresAt)}.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={roleVariant(invite.role)}>{invite.role}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Revoke invitation for ${invite.email}`}
                        onClick={() => revokeInvitation.mutate(invite.id)}
                        disabled={revokeInvitation.isPending}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={invalidate} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.user.id === user?.id ? 'Leave this organization?' : `Remove ${removing?.user.name ?? 'member'}?`}
        description={
          removing?.user.id === user?.id
            ? 'You will lose access to all projects in this organization.'
            : 'They will immediately lose access to all projects and tasks.'
        }
        confirmLabel={removing?.user.id === user?.id ? 'Leave' : 'Remove'}
        destructive
        loading={removeMember.isPending}
        onConfirm={() => {
          if (removing) removeMember.mutate(removing);
        }}
      />
    </div>
  );
}
