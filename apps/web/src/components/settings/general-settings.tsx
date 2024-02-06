'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { organizationSchema, type OrganizationValues } from '@/lib/schemas/workspace';
import * as organizationsApi from '@/lib/api/organizations';
import { getErrorMessage } from '@/lib/api/client';
import { useOrg } from '@/hooks/use-org';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';

export function GeneralSettings() {
  const router = useRouter();
  const { currentOrg, can, refetch } = useOrg();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmName, setConfirmName] = React.useState('');
  const canEdit = can('ADMIN');
  const isOwner = can('OWNER');

  const form = useForm<OrganizationValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { name: currentOrg?.name ?? '', slug: currentOrg?.slug ?? '' },
  });

  React.useEffect(() => {
    form.reset({ name: currentOrg?.name ?? '', slug: currentOrg?.slug ?? '' });
  }, [currentOrg, form]);

  const update = useMutation({
    mutationFn: (values: OrganizationValues) =>
      organizationsApi.updateOrganization(currentOrg?.id ?? '', { name: values.name, slug: values.slug || undefined }),
    onSuccess: async () => {
      toast({ title: 'Organization updated', variant: 'success' });
      await refetch();
    },
    onError: (error) => toast({ title: 'Update failed', description: getErrorMessage(error), variant: 'error' }),
  });

  const remove = useMutation({
    mutationFn: () => organizationsApi.deleteOrganization(currentOrg?.id ?? ''),
    onSuccess: async () => {
      toast({ title: 'Organization deleted', variant: 'success' });
      setDeleteOpen(false);
      await refetch();
      router.replace('/app');
    },
    onError: (error) => toast({ title: 'Delete failed', description: getErrorMessage(error), variant: 'error' }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Name and URL slug for this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((values) => update.mutate(values))} className="max-w-lg space-y-4" noValidate>
            <fieldset disabled={!canEdit} className="space-y-4">
              <FormField label="Name" htmlFor="org-settings-name" required>
                <Input id="org-settings-name" error={form.formState.errors.name?.message} {...form.register('name')} />
              </FormField>
              <FormField label="Slug" htmlFor="org-settings-slug" hint="Lowercase letters, numbers and hyphens.">
                <Input id="org-settings-slug" error={form.formState.errors.slug?.message} {...form.register('slug')} />
              </FormField>
            </fieldset>
            {canEdit ? (
              <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
                Save changes
              </Button>
            ) : (
              <p className="text-sm text-slate-500">Only admins and owners can edit organization settings.</p>
            )}
          </form>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-rose-200">
          <CardHeader>
            <CardTitle className="text-rose-700">Danger zone</CardTitle>
            <CardDescription>Deleting an organization removes all projects, tasks, members and API keys.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete organization
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          title="Delete organization"
          description={`Type "${currentOrg?.name ?? ''}" to confirm. This action cannot be undone.`}
        >
          <Input
            id="confirm-org-name"
            aria-label="Organization name confirmation"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            placeholder={currentOrg?.name}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={remove.isPending}
              disabled={confirmName.trim() !== (currentOrg?.name ?? '').trim()}
              onClick={() => remove.mutate()}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
