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

export const apiPatch = <T>(path: string, data: unknown): Promise<T> =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(data) });

export const apiDelete = <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' });

/** The five roles of BUILD-PLAN Step 15. Sign-in issues `owner` until real accounts exist. */
export type Role = 'owner' | 'manager' | 'operations' | 'agent' | 'accountant';

export interface SessionUser {
  email: string;
  name: string;
  role: Role;
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

/** Shopify's stock for one variant beside our warehouse (units, not money). */
export interface StockComparisonRow {
  variantId: string;
  store: StoreKey;
  sku: string | null;
  title: string;
  onHand: number;
  available: number;
  committed: number;
  committedUnbooked: number;
  estimate: number;
  warehouse: number;
  difference: number;
  readAt: string;
}

// ---- Confirmation Desk ----

export type ConfirmationState = 'pending' | 'confirmed' | 'no_answer' | 'changed' | 'cancelled' | 'unreachable';
export type AttemptOutcome = 'confirmed' | 'changed' | 'cancelled' | 'no_answer' | 'callback' | 'wrong_number' | 'rescheduled';
export type Channel = 'whatsapp' | 'call';

export interface QueueRow {
  orderId: string;
  store: StoreKey;
  orderNumber: string;
  placedAt: string;
  totalPaisa: string;
  items: string;
  customerName: string | null;
  phone: string | null;
  city: string | null;
  state: ConfirmationState;
  source: 'desk' | 'shopify_tags' | 'none';
  attempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  outcomeReason: string | null;
  agent: string | null;
  due: boolean;
  history: { delivered: number; returned: number };
  whatsappUrl: string | null;
  callUrl: string | null;
}

export interface QueuePage {
  total: number;
  page: number;
  pageSize: number;
  rows: QueueRow[];
}

export interface DeskAttempt {
  id: string;
  at: string;
  agent: string;
  channel: Channel | null;
  outcome: AttemptOutcome;
  followUpAt: string | null;
  reason: string | null;
  note: string | null;
}

export interface DeskOrder {
  orderId: string;
  store: StoreKey;
  orderNumber: string;
  placedAt: string;
  totalPaisa: string;
  state: string | null;
  cancelledInShopify: boolean;
  booked: boolean;
  customerName: string | null;
  phone: string | null;
  city: string | null;
  lines: Array<{ title: string; sku: string | null; qty: number; totalPaisa: string }>;
  confirmation: { state: ConfirmationState; source: string; attempts: number; nextAttemptAt: string | null; outcomeReason: string | null; confirmedAt: string | null } | null;
  attempts: DeskAttempt[];
  whatsappUrl: string | null;
  callUrl: string | null;
}

export interface CustomerHistory {
  phone: string;
  orders: Array<{ orderId: string; store: StoreKey; orderNumber: string; placedAt: string; totalPaisa: string; state: string | null; channel: string; city: string | null }>;
  counts: { orders: number; delivered: number; refused: number; cancelled: number; inFlight: number; awaiting: number };
  deliveryRate: number | null;
  city: { name: string; delivered: number; returned: number; returnRate: number | null } | null;
}

export interface AgentPerformance {
  agentId: string;
  name: string;
  contacts: number;
  ordersWorked: number;
  confirmed: number;
  changed: number;
  cancelled: number;
  noAnswer: number;
  wrongNumber: number;
  callbacks: number;
  unreachable: number;
  confirmationRate: number | null;
  medianMinutesToFirstContact: number | null;
  outcomes: { delivered: number; returned: number; returnRate: number | null };
}

export interface DeskAlert {
  id: string;
  kind: 'confirmed_not_booked' | 'cancelled_but_booked';
  severity: 'info' | 'warning' | 'error';
  orderId: string | null;
  store: StoreKey | null;
  detail: Record<string, unknown>;
  openedAt: string;
}

export interface DeskSettings {
  maxAttempts: number;
  retryMinutes: number[];
  deskHours: { open: string; close: string };
  whatsappTemplates: { nur: string; organics: string };
}

// ---- Influencers and breakdowns ----

export interface Influencer {
  id: string;
  handle: string;
  name: string;
  city: string | null;
  followers: number | null;
  niche: string | null;
  notes: string | null;
  isActive: boolean;
  codes: Array<{ id: string; store: StoreKey; code: string; orders: number }>;
}

export interface UnassignedCode {
  store: StoreKey;
  code: string;
  orders: number;
  lastUsedAt: string;
}

/** One row of a Step 14 breakdown; amounts are paisa strings. */
export interface BreakdownRow {
  key: string;
  label: string;
  revenue: string;
  goods: string;
  postexCharges: string;
  marketing: string;
  writeOff: string;
  otherExpenses: string;
  profit: string;
  parcels: number;
}

// ---- Parcels ----

export interface ParcelRow {
  id: string;
  trackingNumber: string;
  account: string;
  store: StoreKey | null;
  stage: 'booked' | 'in_transit' | 'attempted' | 'delivered' | 'returning' | 'returned' | 'cancelled';
  statusCode: string | null;
  statusMessage: string | null;
  city: string | null;
  codPaisa: string | null;
  bookedAt: string | null;
  statusUpdatedAt: string | null;
  daysInTransit: number | null;
  attempts: number;
  lastFailureReason: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderRef: string | null;
  pr: boolean;
  checkedIn: 'restocked' | 'damaged' | null;
}

export interface ParcelPage {
  total: number;
  page: number;
  pageSize: number;
  rows: ParcelRow[];
}

export interface ParcelDetail extends ParcelRow {
  statusLabel: string | null;
  customerPhone: string | null;
  deliveredAt: string | null;
  lastSyncedAt: string | null;
  matchMethod: string | null;
  events: Array<{ code: string; message: string; occurredAt: string | null }>;
  charges: Array<{ kind: string; amountPaisa: string }>;
  payouts: Array<{ cprNumber: string; paidAt: string | null; amountPaisa: string }>;
  checkIn: { outcome: 'restocked' | 'damaged'; at: string; by: string; note: string | null } | null;
  order: {
    id: string;
    number: string;
    store: StoreKey;
    placedAt: string;
    totalPaisa: string;
    state: string | null;
    financialStatus: string | null;
    customerName: string | null;
    city: string | null;
    lines: Array<{ title: string; sku: string | null; qty: number; totalPaisa: string }>;
  } | null;
  openItems: Array<{ id: string; kind: string; severity: string; detail: Record<string, unknown> }>;
}
