import { api } from './client';
import type { SuccessResponse, User } from './types';

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string | null;
}

export function getMe(): Promise<User> {
  return api.get<User>('/users/me');
}

export function updateMe(input: UpdateProfileInput): Promise<User> {
  return api.patch<User>('/users/me', input);
}

export function changePassword(currentPassword: string, newPassword: string): Promise<SuccessResponse> {
  return api.patch<SuccessResponse>('/users/me/password', { currentPassword, newPassword });
}
