'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/schemas/auth';
import { getErrorMessage } from '@/lib/api/client';
import * as authApi from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await authApi.resetPassword(token, values.password);
      setDone(true);
      window.setTimeout(() => router.replace('/login'), 1500);
    } catch (error) {
      setServerError(getErrorMessage(error, 'This reset link is invalid or has expired'));
    }
  });

  if (!token) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-slate-900">Invalid link</h1>
        <p className="mt-2 text-sm text-slate-600">This password reset link is missing its token.</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
          Request a new link
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-slate-900">Password updated</h1>
        <p className="mt-2 text-sm text-slate-600">You can now sign in with your new password. Redirecting...</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Choose a new password</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <FormField label="New password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            error={form.formState.errors.password?.message}
            {...form.register('password')}
          />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirmPassword" required>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            error={form.formState.errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />
        </FormField>
        {serverError && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}
