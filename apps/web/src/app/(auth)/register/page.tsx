'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterValues } from '@/lib/schemas/auth';
import { getErrorMessage } from '@/lib/api/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const next = safeNext(params.get('next'));

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerUser(values.name, values.email, values.password);
      router.replace(next);
    } catch (error) {
      setServerError(getErrorMessage(error, 'Unable to create account'));
    }
  });

  const errors = form.formState.errors;

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">Start with a free workspace. Upgrade any time.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <FormField label="Full name" htmlFor="name" required>
          <Input id="name" autoComplete="name" error={errors.name?.message} {...form.register('name')} />
        </FormField>
        <FormField label="Email" htmlFor="email" required>
          <Input id="email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        </FormField>
        <FormField label="Password" htmlFor="password" required hint="At least 8 characters with a letter and a number.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...form.register('password')}
          />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirmPassword" required>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />
        </FormField>
        {serverError && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href={`/login${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense fallback={null}>
      <RegisterForm />
    </React.Suspense>
  );
}
