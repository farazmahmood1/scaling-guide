import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { describeAccessChange, sameAccess } from '@/lib/access';
import {
  FORBIDDEN_EVENT,
  UNAUTHORIZED_EVENT,
  apiGet,
  apiPost,
  getToken,
  setToken,
  type LoginResponse,
  type MeResponse,
  type Permission,
  type SessionUser,
} from '@/lib/api';

/** How often a signed-in tab asks the server what the person may do now. */
export const ACCESS_CHECK_MS = 30_000;

interface AuthValue {
  user?: SessionUser;
  roleLabel?: string;
  /** What the server says this person may do, as of the last check. The menus are drawn from it. */
  permissions: readonly Permission[];
  totp?: MeResponse['totp'];
  /** An owner or manager who has not set up an authenticator app: the app shows only that, until they do. */
  enrolmentRequired: boolean;
  /** True while the stored token is being checked on first load. */
  restoring: boolean;
  signIn: (email: string, password: string, code?: string) => Promise<LoginResponse>;
  signOut: () => void;
  can: (permission: Permission) => boolean;
  /** Asks the server again who this is and what they may do. */
  refresh: () => Promise<void>;
  /** Takes a new token (after setting up the authenticator) and re-reads the account. */
  adoptToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse>();
  const [restoring, setRestoring] = useState(true);
  const latest = useRef<MeResponse>(undefined);
  const inFlight = useRef(false);

  const apply = useCallback((next: MeResponse) => {
    const previous = latest.current;
    if (sameAccess(previous, next)) return;
    const change = describeAccessChange(previous, next);
    latest.current = next;
    setMe(next);
    if (change) toast.info(change);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken() || inFlight.current) return;
    inFlight.current = true;
    try {
      apply(await apiGet<MeResponse>('/api/v1/auth/me'));
    } catch {
      // A 401 already ended the session (see below); any other failure leaves what we know in place.
    } finally {
      inFlight.current = false;
    }
  }, [apply]);

  // A token in localStorage only counts once the backend confirms it is still valid.
  useEffect(() => {
    if (!getToken()) {
      setRestoring(false);
      return;
    }
    apiGet<MeResponse>('/api/v1/auth/me')
      .then((data) => {
        latest.current = data;
        setMe(data);
      })
      .catch(() => setToken(null))
      .finally(() => setRestoring(false));
  }, []);

  // Any request rejected with 401 ends the session here too.
  useEffect(() => {
    const onUnauthorized = () => {
      latest.current = undefined;
      setMe(undefined);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Permissions are read again as the person works: on a timer, when they come back to the tab, and
  // straight after the server refuses something. A role changed by an owner therefore shows up
  // here within seconds, with no reload.
  useEffect(() => {
    if (!me) return;
    const timer = setInterval(() => void refresh(), ACCESS_CHECK_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    const onRefused = () => void refresh();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(FORBIDDEN_EVENT, onRefused);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(FORBIDDEN_EVENT, onRefused);
    };
  }, [me, refresh]);

  const signIn = useCallback(async (email: string, password: string, code?: string) => {
    const data = await apiPost<LoginResponse>('/api/v1/auth/login', { email, password, ...(code ? { code } : {}) });
    setToken(data.token);
    const next = await apiGet<MeResponse>('/api/v1/auth/me');
    latest.current = next;
    setMe(next);
    return data;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    latest.current = undefined;
    setMe(undefined);
  }, []);

  const adoptToken = useCallback(async (token: string) => {
    setToken(token);
    const next = await apiGet<MeResponse>('/api/v1/auth/me');
    latest.current = next;
    setMe(next);
  }, []);

  const permissions = useMemo<readonly Permission[]>(() => me?.permissions ?? [], [me]);
  const can = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);

  const value = useMemo<AuthValue>(
    () => ({
      user: me?.user,
      roleLabel: me?.roleLabel,
      permissions,
      totp: me?.totp,
      enrolmentRequired: me?.enrolmentRequired ?? false,
      restoring,
      signIn,
      signOut,
      can,
      refresh,
      adoptToken,
    }),
    [me, permissions, restoring, signIn, signOut, can, refresh, adoptToken],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
