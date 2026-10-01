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

export const apiPut = <T>(path: string, data: unknown): Promise<T> =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(data) });

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

export type StoreKey = 'nur' | 'organics';
export type ItemStatus = 'open' | 'resolved' | 'ignored';

/** One row of the reconciliation queue. `detail` is written by the backend jobs and holds no PII. */
export interface ReviewItem {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'error';
  status: ItemStatus;
  storeKey: StoreKey | null;
  orderId: string | null;
  orderNumber: string | null;
  shipmentId: string | null;
  trackingNumber: string | null;
  detail: Record<string, unknown>;
  note: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReviewItemPage {
  items: ReviewItem[];
  nextBefore: string | null;
}

export interface PrefixCount {
  prefix: string | null;
  parcels: number;
  matched: number;
  configured: boolean;
}

export interface AccountMatchReport {
  account: string;
  storeKey: StoreKey | null;
  parcels: number;
  matched: number;
  unmatched: number;
  unmatchedRate: number;
  unmatchedWithoutItem: number;
  byMethod: Record<string, number>;
  unparsedRefs: number;
  prefixes: PrefixCount[];
  withinTarget: boolean;
}

export interface ReconciliationSummary {
  open: Record<string, number>;
  matching: AccountMatchReport[];
}

export interface OrderCandidate {
  id: string;
  orderNumber: string;
  /** Integer paisa as a decimal string: money never travels as a float. */
  totalPaisa: string;
  city: string | null;
  placedAt: string;
}

export interface MatchingSetting {
  refPrefixes: Record<StoreKey, string[]>;
  windowDays: number;
}

export interface AwaitingReturn {
  shipmentId: string;
  trackingNumber: string;
  account: string;
  orderId: string | null;
  returnedAt: string | null;
}

export interface StockLocation {
  id: string;
  key: string | null;
  kind: string;
  label: string;
}

export interface Quant {
  variant_id: string;
  store: StoreKey;
  sku: string | null;
  product: string;
  variant: string;
  location_id: string;
  location: string;
  location_kind: string;
  qty: number;
}

export interface VariantHit {
  id: string;
  store: StoreKey;
  sku: string | null;
  product: string;
  variant: string;
}

/** Amounts are integer paisa in decimal strings. */
export interface TrialBalance {
  rows: Array<{ code: string; name: string; type: string; debit: string; credit: string; balance: string }>;
  debit: string;
  credit: string;
  balanced: boolean;
}

export interface LedgerLine {
  entryId: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string;
  storeId: string | null;
  debit: string;
  credit: string;
  reversed: boolean;
}

export interface Period {
  year: number;
  month: number;
  status: 'open' | 'closed';
  closedAt: string | null;
  closedBy: string | null;
  entries: number;
  closableFrom: string;
}

export interface InventoryCheck {
  asAt: string;
  stockValue: string;
  ledgerValue: string;
  difference: string;
  agrees: boolean;
  variants: number;
  units: number;
  missingCost: Array<{ variantId: string; sku: string | null; title: string; units: number }>;
  negative: Array<{ variantId: string; sku: string | null; title: string; units: number }>;
}

export interface OpeningBalances {
  entriesBeforeOpening: { count: number; earliest: string | null };
  accounts: Array<{ key: string; code: string }>;
  opening: { date: string; lines: Array<{ code: string; balancePaisa: string; store: StoreKey | null }> } | null;
}
