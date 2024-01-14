'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { organizationSchema, type OrganizationValues } from '@/lib/schemas/workspace';
import * as organizationsApi from '@/lib/api/organizations';
import { getErrorMessage } from '@/lib/api/client';
import { slugify } from '@/lib/utils';
import { useOrg } from '@/hooks/use-org';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';

export interface CreateOrgDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function CreateOrgDialog({ open, onOpenChange, hideTrigger = false }: CreateOrgDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const router = useRouter();
  const { refetch, switchOrg } = useOrg();
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [slugTouched, setSlugTouched] = React.useState(false);

  const form = useForm<OrganizationValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { name: '', slug: '' },
  });

  const name = form.watch('name');
  React.useEffect(() => {
    if (!slugTouched) form.setValue('slug', slugify(name));
  }, [name, slugTouched, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const org = await organizationsApi.createOrganization({
        name: values.name,
        slug: values.slug || undefined,
      });
      await refetch();
      await switchOrg(org.id);
      toast({ title: 'Organization created', description: `${org.name} is ready.`, variant: 'success' });
      form.reset();
      setSlugTouched(false);
      setOpen(false);
      router.push('/app');
    } catch (error) {
      setServerError(getErrorMessage(error, 'Unable to create organization'));
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New organization
          </Button>
        </DialogTrigger>
      )}
      <DialogContent title="Create organization" description="A shared workspace for your team's projects.">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Name" htmlFor="org-name" required>
            <Input id="org-name" placeholder="Acme Inc." error={form.formState.errors.name?.message} {...form.register('name')} />
          </FormField>
          <FormField label="Slug" htmlFor="org-slug" hint="Used in URLs. Lowercase letters, numbers and hyphens.">
            <Input
              id="org-slug"
              placeholder="acme-inc"
              error={form.formState.errors.slug?.message}
              {...form.register('slug', { onChange: () => setSlugTouched(true) })}
            />
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
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
