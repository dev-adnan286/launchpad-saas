'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, clearSession, getRefreshToken, tokenStore } from '@/lib/api/client';
import * as authApi from '@/lib/api/auth';
import * as usersApi from '@/lib/api/users';
import type { User } from '@/lib/api/types';

export interface AuthContextValue {
  user: User | null;
  /** True until the initial session restore has finished. */
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  setUser: (user: User) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshUser = React.useCallback(async (): Promise<User | null> => {
    try {
      const me = await usersApi.getMe();
      setUserState(me);
      return me;
    } catch {
      setUserState(null);
      return null;
    }
  }, []);

  // Restore session on boot: exchange refresh token, then load the profile.
  React.useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!getRefreshToken()) {
        if (!cancelled) setLoading(false);
        return;
      }
      const ok = await api.refreshSession();
      if (ok && !cancelled) await refreshUser();
      if (!cancelled) setLoading(false);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  // When the client clears the session (refresh failure), drop the user.
  React.useEffect(() => {
    api.setOnUnauthorized(() => {
      setUserState(null);
      queryClient.clear();
    });
    const unsubscribe = tokenStore.subscribe((token) => {
      if (!token) setUserState(null);
    });
    return () => {
      api.setOnUnauthorized(undefined);
      unsubscribe();
    };
  }, [queryClient]);

  const login = React.useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    setUserState(result.user);
    return result.user;
  }, []);

  const register = React.useCallback(async (name: string, email: string, password: string) => {
    const result = await authApi.register({ name, email, password });
    setUserState(result.user);
    return result.user;
  }, []);

  const logout = React.useCallback(async () => {
    await authApi.logout();
    clearSession();
    setUserState(null);
    queryClient.clear();
  }, [queryClient]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      refreshUser,
      setUser: setUserState,
    }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
