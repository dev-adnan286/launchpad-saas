'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogOut } from 'lucide-react';
import { changePasswordSchema, profileSchema, type ChangePasswordValues, type ProfileValues } from '@/lib/schemas/auth';
import * as usersApi from '@/lib/api/users';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';

export default function ProfilePage() {
  const router = useRouter();
  const { user, setUser, logout } = useAuth();
  const { toast } = useToast();

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', avatarUrl: user?.avatarUrl ?? '' },
  });

  React.useEffect(() => {
    profileForm.reset({ name: user?.name ?? '', avatarUrl: user?.avatarUrl ?? '' });
  }, [user, profileForm]);

  const avatarPreview = profileForm.watch('avatarUrl');
  const namePreview = profileForm.watch('name');

  const updateProfile = useMutation({
    mutationFn: (values: ProfileValues) => usersApi.updateMe({ name: values.name, avatarUrl: values.avatarUrl || null }),
    onSuccess: (updated) => {
      setUser(updated);
      toast({ title: 'Profile updated', variant: 'success' });
    },
    onError: (error) => toast({ title: 'Update failed', description: getErrorMessage(error), variant: 'error' }),
  });

  const passwordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const changePassword = useMutation({
    mutationFn: (values: ChangePasswordValues) => usersApi.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      passwordForm.reset();
      toast({ title: 'Password changed', variant: 'success' });
    },
    onError: (error) => toast({ title: 'Password change failed', description: getErrorMessage(error), variant: 'error' }),
  });

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}. Member since {formatDate(user.createdAt)}.</p>
        </div>
        <Button variant="secondary" onClick={() => void handleLogout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Your name and avatar are visible to everyone in your organizations.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate(values))} className="max-w-lg space-y-4" noValidate>
            <div className="flex items-center gap-4">
              <Avatar name={namePreview || user.name} src={avatarPreview || null} size="lg" />
              <p className="text-sm text-slate-500">Paste an image URL below to change your avatar.</p>
            </div>
            <FormField label="Full name" htmlFor="profile-name" required>
              <Input id="profile-name" error={profileForm.formState.errors.name?.message} {...profileForm.register('name')} />
            </FormField>
            <FormField label="Avatar URL" htmlFor="profile-avatar">
              <Input
                id="profile-avatar"
                placeholder="https://..."
                error={profileForm.formState.errors.avatarUrl?.message}
                {...profileForm.register('avatarUrl')}
              />
            </FormField>
            <FormField label="Email" htmlFor="profile-email">
              <Input id="profile-email" value={user.email} disabled readOnly />
            </FormField>
            <Button type="submit" loading={updateProfile.isPending} disabled={!profileForm.formState.isDirty}>
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use at least 8 characters with a letter and a number.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))} className="max-w-lg space-y-4" noValidate>
            <FormField label="Current password" htmlFor="current-password" required>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                error={passwordForm.formState.errors.currentPassword?.message}
                {...passwordForm.register('currentPassword')}
              />
            </FormField>
            <FormField label="New password" htmlFor="new-password" required>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                error={passwordForm.formState.errors.newPassword?.message}
                {...passwordForm.register('newPassword')}
              />
            </FormField>
            <FormField label="Confirm new password" htmlFor="confirm-new-password" required>
              <Input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                error={passwordForm.formState.errors.confirmPassword?.message}
                {...passwordForm.register('confirmPassword')}
              />
            </FormField>
            <Button type="submit" loading={changePassword.isPending}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
