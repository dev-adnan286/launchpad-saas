'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inviteSchema, type InviteValues } from '@/lib/schemas/workspace';
import * as invitationsApi from '@/lib/api/invitations';
import { getErrorMessage, isApiError } from '@/lib/api/client';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';

const INVITE_ROLES: Array<{ value: InviteValues['role']; label: string; description: string }> = [
  { value: 'ADMIN', label: 'Admin', description: 'Manage members, projects and settings' },
  { value: 'MEMBER', label: 'Member', description: 'Create and edit projects and tasks' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access' },
];

export function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}) {
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'MEMBER' },
  });

  React.useEffect(() => {
    if (open) {
      form.reset();
      setServerError(null);
    }
  }, [open, form]);

  const role = form.watch('role');

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const invitation = await invitationsApi.createInvitation(values);
      toast({ title: 'Invitation sent', description: `We emailed ${invitation.email}.`, variant: 'success' });
      onInvited();
      onOpenChange(false);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to send invitation');
      if (isApiError(error) && error.isConflict) {
        toast({ title: 'Cannot invite', description: message, variant: 'error' });
      }
      setServerError(message);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Invite a teammate" description="They will receive an email with a link to join.">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Email" htmlFor="invite-email" required>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />
          </FormField>
          <FormField
            label="Role"
            htmlFor="invite-role"
            hint={INVITE_ROLES.find((option) => option.value === role)?.description}
          >
            <NativeSelect id="invite-role" className="w-full" {...form.register('role')}>
              {INVITE_ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {serverError && (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
