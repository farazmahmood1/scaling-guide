/** Base URL for the backend. Empty in development, where Vite proxies /api to port 4000. */
const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'nur.session';
export const UNAUTHORIZED_EVENT = 'nur:unauthorized';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null): void => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // An expired or rejected session drops the token and sends the app back to sign-in.
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: { message?: string } }).error?.message ?? response.statusText)
        : response.statusText;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export const apiGet = <T>(path: string, signal?: AbortSignal): Promise<T> => request<T>(path, { signal });

export const apiPost = <T>(path: string, data: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(data) });

export interface SessionUser {
  email: string;
  name: string;
  role: 'owner';
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: SessionUser;
}

export interface ConnectionHealth {
  key: string;
  label: string;
  detail: string;
  status: 'ok' | 'error' | 'not_configured';
  message?: string;
}

/** Result of actually calling each integration, not just reading the config. */
export interface IntegrationHealth {
  checkedAt: string;
  shopify: ConnectionHealth[];
  postex: ConnectionHealth[];
}

export interface IntegrationStatus {
  shopify: {
    apiVersion: string;
    stores: Array<{
      key: string;
      label: string;
      domain: string;
      ready: boolean;
      auth: 'access_token' | 'client_credentials' | 'missing';
    }>;
  };
  postex: {
    writesEnabled: boolean;
    accounts: Array<{ key: string; label: string; ready: boolean }>;
  };
}
