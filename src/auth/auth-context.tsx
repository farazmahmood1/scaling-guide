import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  UNAUTHORIZED_EVENT,
  apiGet,
  apiPost,
  getToken,
  setToken,
  type LoginResponse,
  type SessionUser,
} from '@/lib/api';

interface AuthValue {
  user?: SessionUser;
  /** True while the stored token is being checked on first load. */
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser>();
  const [restoring, setRestoring] = useState(true);

  // A token in localStorage only counts once the backend confirms it is still valid.
  useEffect(() => {
    if (!getToken()) {
      setRestoring(false);
      return;
    }
    apiGet<{ user: SessionUser }>('/api/v1/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setRestoring(false));
  }, []);

  // Any request rejected with 401 ends the session here too.
  useEffect(() => {
    const onUnauthorized = () => setUser(undefined);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await apiPost<LoginResponse>('/api/v1/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(undefined);
  }, []);

  const value = useMemo<AuthValue>(() => ({ user, restoring, signIn, signOut }), [user, restoring, signIn, signOut]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
