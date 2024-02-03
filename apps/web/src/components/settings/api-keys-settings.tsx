'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Check, Copy, KeyRound, Plus } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import * as apiKeysApi from '@/lib/api/api-keys';
import { getErrorMessage } from '@/lib/api/client';
import type { ApiKey, ApiKeyCreated } from '@/lib/api/types';
import { apiKeySchema, type ApiKeyValues } from '@/lib/schemas/workspace';
import { copyToClipboard, formatDate, relativeTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogFooter, ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';

function keyStatus(key: ApiKey): { label: string; variant: 'success' | 'danger' | 'warning' } {
  if (key.revokedAt) return { label: 'Revoked', variant: 'danger' };
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) return { label: 'Expired', variant: 'warning' };
  return { label: 'Active', variant: 'success' };
}

export function ApiKeysSettings() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [created, setCreated] = React.useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [revoking, setRevoking] = React.useState<ApiKey | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isAdmin = can('ADMIN');

  const keysQuery = useQuery({ queryKey: ['api-keys', orgId], queryFn: apiKeysApi.listApiKeys, enabled: Boolean(orgId) && isAdmin });

  const form = useForm<ApiKeyValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: '', expiresAt: '' },
  });

  const create = useMutation({
    mutationFn: (values: ApiKeyValues) =>
      apiKeysApi.createApiKey({
        name: values.name,
        expiresAt: values.expiresAt ? new Date(`${values.expiresAt}T23:59:59`).toISOString() : null,
      }),
    onSuccess: (result) => {
      setCreateOpen(false);
      setCreated(result);
      setCopied(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] });
    },
    onError: (error) => setServerError(getErrorMessage(error, 'Unable to create API key')),
  });

  const revoke = useMutation({
    mutationFn: (key: ApiKey) => apiKeysApi.revokeApiKey(key.id),
    onSuccess: () => {
      toast({ title: 'API key revoked', variant: 'success' });
      setRevoking(null);
      void queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] });
    },
    onError: (error) => toast({ title: 'Could not revoke key', description: getErrorMessage(error), variant: 'error' }),
  });

  const handleCopy = async () => {
    if (!created) return;
    const ok = await copyToClipboard(created.plainKey);
    setCopied(ok);
    toast({ title: ok ? 'Copied to clipboard' : 'Copy failed', variant: ok ? 'success' : 'error' });
  };

  if (!isAdmin) {
    return <p className="text-sm text-slate-500">Only admins and owners can manage API keys.</p>;
  }

  const keys = keysQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Use keys with <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">Authorization: Bearer lp_...</code> to access
              this organization from scripts and integrations.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setServerError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create key
          </Button>
        </CardHeader>
        <CardContent>
          {keysQuery.isError ? (
            <ErrorState message={getErrorMessage(keysQuery.error)} onRetry={() => void keysQuery.refetch()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keysQuery.isPending ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 6 }).map((__, cell) => (
                        <TableCell key={cell}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : keys.length === 0 ? (
                  <TableEmpty colSpan={6}>No API keys yet.</TableEmpty>
                ) : (
                  keys.map((key) => {
                    const status = keyStatus(key);
                    return (
                      <TableRow key={key.id}>
                        <TableCell>
                          <p className="font-medium text-slate-900">{key.name}</p>
                          <p className="text-xs text-slate-500">
                            Created by {key.createdBy.name} on {formatDate(key.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{key.prefix}...</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">{key.lastUsedAt ? relativeTime(key.lastUsedAt) : 'Never'}</TableCell>
                        <TableCell className="text-slate-500">{key.expiresAt ? formatDate(key.expiresAt) : 'Never'}</TableCell>
                        <TableCell className="text-right">
                          {!key.revokedAt && (
                            <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setRevoking(key)}>
                              Revoke
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
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="Create API key" description="Give the key a descriptive name so you can recognise it later.">
          <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="space-y-4" noValidate>
            <FormField label="Name" htmlFor="api-key-name" required>
              <Input id="api-key-name" placeholder="CI pipeline" error={form.formState.errors.name?.message} {...form.register('name')} />
            </FormField>
            <FormField label="Expires" htmlFor="api-key-expires" hint="Leave empty for a key that never expires.">
              <Input id="api-key-expires" type="date" error={form.formState.errors.expiresAt?.message} {...form.register('expiresAt')} />
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
              <Button type="submit" loading={create.isPending}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent title="Copy your new API key" hideClose>
          <div className="space-y-4">
            <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>This key is shown only once. Store it somewhere safe. If you lose it, revoke it and create a new one.</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm">
                {created?.plainKey}
              </code>
              <Button variant="secondary" size="icon" onClick={() => void handleCopy()} aria-label="Copy API key">
                {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {created?.apiKey.name}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>I have saved the key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke "${revoking?.name ?? ''}"?`}
        description="Any integration using this key will immediately stop working."
        confirmLabel="Revoke key"
        destructive
        loading={revoke.isPending}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking);
        }}
      />
    </div>
  );
}
