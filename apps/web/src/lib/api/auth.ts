import { api, clearSession, getRefreshToken, setSession } from './client';
import type { AuthResponse, SuccessResponse, TokenPair } from './types';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const result = await api.post<AuthResponse>('/auth/register', input, { anonymous: true });
  setSession(result);
  return result;
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const result = await api.post<AuthResponse>('/auth/login', input, { anonymous: true });
  setSession(result);
  return result;
}

export async function refresh(): Promise<TokenPair | null> {
  const ok = await api.refreshSession();
  if (!ok) return null;
  const refreshToken = getRefreshToken();
  return refreshToken ? { accessToken: '', refreshToken } : null;
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await api.post<SuccessResponse>('/auth/logout', { refreshToken }, { noRetry: true });
    }
  } catch {
    // Session is cleared locally regardless of server outcome.
  } finally {
    clearSession();
  }
}

export function forgotPassword(email: string): Promise<SuccessResponse> {
  return api.post<SuccessResponse>('/auth/forgot-password', { email }, { anonymous: true });
}

export function resetPassword(token: string, password: string): Promise<SuccessResponse> {
  return api.post<SuccessResponse>('/auth/reset-password', { token, password }, { anonymous: true });
}
