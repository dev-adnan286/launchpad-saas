'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Rocket } from 'lucide-react';
import * as invitationsApi from '@/lib/api/invitations';
import { getErrorMessage } from '@/lib/api/client';
import { useAuth } from '@/hooks/use-auth';
import { useOrg } from '@/hooks/use-org';
import { useToast } from '@/components/ui/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, roleVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { user, loading } = useAuth();
  const { switchOrg, refetch } = useOrg();
  const { toast } = useToast();

  const invitationQuery = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => invitationsApi.getInvitationByToken(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => invitationsApi.acceptInvitation(token),
    onSuccess: async () => {
      const orgId = invitationQuery.data?.organization.id;
      await refetch();
      if (orgId) {
        try {
          await switchOrg(orgId);
        } catch {
          // Membership exists; org list refresh will surface it.
        }
      }
      toast({ title: 'Invitation accepted', description: 'Welcome to the team!', variant: 'success' });
      router.replace('/app');
    },
    onError: (error) => {
      toast({ title: 'Could not accept invitation', description: getErrorMessage(error), variant: 'error' });
    },
  });

  const returnTo = `/invite/${encodeURIComponent(token)}`;
  const invitation = invitationQuery.data;
  const emailMismatch = Boolean(user && invitation && user.email.toLowerCase() !== invitation.email.toLowerCase());
  const notPending = invitation && invitation.status !== 'PENDING';
  const expired = invitation && new Date(invitation.expiresAt).getTime() < Date.now();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Rocket className="h-5 w-5" aria-hidden="true" />
        </span>
        LaunchPad
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {invitationQuery.isPending || loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : invitationQuery.isError || !invitation ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Invitation not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              {getErrorMessage(invitationQuery.error, 'This invitation link is invalid or has been revoked.')}
            </p>
            <Link href="/" className={`${buttonVariants({ variant: 'secondary' })} mt-6`}>
              Go home
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Join {invitation.organization.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              You have been invited to join <span className="font-medium">{invitation.organization.name}</span> as{' '}
              <Badge variant={roleVariant(invitation.role)}>{invitation.role}</Badge>
            </p>
            <dl className="mt-4 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>Invited email</dt>
                <dd className="font-medium text-slate-900">{invitation.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Expires</dt>
                <dd className="font-medium text-slate-900">{formatDate(invitation.expiresAt, true)}</dd>
              </div>
            </dl>

            {notPending || expired ? (
              <p role="alert" className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This invitation is {expired ? 'expired' : invitation.status.toLowerCase()} and can no longer be accepted.
              </p>
            ) : !user ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-slate-600">Sign in or create an account with {invitation.email} to accept.</p>
                <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={`${buttonVariants()} w-full`}>
                  Sign in to accept
                </Link>
                <Link
                  href={`/register?next=${encodeURIComponent(returnTo)}`}
                  className={`${buttonVariants({ variant: 'secondary' })} w-full`}
                >
                  Create an account
                </Link>
              </div>
            ) : emailMismatch ? (
              <p role="alert" className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                You are signed in as {user.email}, but this invitation was sent to {invitation.email}. Sign in with the
                invited address to accept it.
              </p>
            ) : (
              <Button className="mt-6 w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
                Accept invitation
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
