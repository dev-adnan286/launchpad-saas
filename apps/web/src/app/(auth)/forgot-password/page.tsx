'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/schemas/auth';
import { getErrorMessage } from '@/lib/api/client';
import * as authApi from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await authApi.forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      setServerError(getErrorMessage(error, 'Unable to send reset email'));
    }
  });

  if (sent) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-slate-900">Check your inbox</h1>
        <p className="mt-2 text-sm text-slate-600">
          If an account exists for <span className="font-medium">{form.getValues('email')}</span>, we sent a link to
          reset the password. The link expires in one hour.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">Enter your email and we will send you a reset link.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <FormField label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
        </FormField>
        {serverError && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
      <Link href="/login" className="mt-6 inline-block text-sm text-slate-600 hover:underline">
        Back to sign in
      </Link>
    </>
  );
}
