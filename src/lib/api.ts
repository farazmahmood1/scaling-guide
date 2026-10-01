/** Base URL for the backend. Empty in development, where Vite proxies /api to port 4000. */
const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'nur.session';
export const UNAUTHORIZED_EVENT = 'nur:unauthorized';
/** A request was refused for lack of permission: the person's role may have changed, so ask the server again. */
export const FORBIDDEN_EVENT = 'nur:forbidden';

export class ApiError extends Error {
  readonly status: number;
  /** The server's stable word for what went wrong (`totp_required`, `locked`, `forbidden`…), when it gave one. */
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
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
    const failure = body && typeof body === 'object' && 'error' in body ? (body as { error?: { message?: string; code?: string } }).error : undefined;
    // Refused for permission: tell the app, so it re-reads what this person may do instead of waiting for its next check.
    if (response.status === 403) window.dispatchEvent(new Event(FORBIDDEN_EVENT));
    throw new ApiError(failure?.message ?? response.statusText, response.status, failure?.code);
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

/** Everything a person may do, as the server's permission table names it. The server is the authority; the menus follow it. */
export const PERMISSIONS = [
  'dashboard.read',
  'orders.read',
  'parcels.read',
  'returns.read',
  'reconciliation.read',
  'stock.read',
  'purchasing.read',
  'partners.read',
  'pr.read',
  'accounting.read',
  'reports.read',
  'integrations.read',
  'confirmations.work',
  'orders.import',
  'returns.checkin',
  'reconciliation.work',
  'stock.adjust',
  'purchasing.write',
  'partners.write',
  'pr.write',
  'accounting.close',
  'settings.manage',
  'users.manage',
  'pii.phone',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: SessionUser;
  /** An owner or manager who has not set up an authenticator app yet: they can only do that. */
  enrolmentRequired?: boolean;
  usedRecoveryCode?: boolean;
}

/** Who is signed in and what they may do, as the server sees it right now. */
export interface MeResponse {
  user: SessionUser;
  roleLabel: string;
  permissions: Permission[];
  totp: { enabled: boolean; required: boolean };
  enrolmentRequired: boolean;
}

export interface TotpSetup {
  secret: string;
  otpauthUri: string;
}

export interface TotpEnabled {
  recoveryCodes: string[];
  token: string;
  expiresIn: number;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  hasPassword: boolean;
  totpEnabled: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleMatrix {
  roles: Array<{ role: Role; label: string; permissions: Permission[] }>;
  permissions: Permission[];
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

// ---- Settings ----

export interface AlertSettings {
  stuckDays: number;
  confirmedNotBookedHours: number;
  confirmedLookbackDays: number;
}

export interface PurchasingSettings {
  tolerancePercent: number;
  /** Paisa. */
  toleranceAbsolutePaisa: number;
  velocityWindowDays: number;
  coverDays: number;
  defaultLeadTimeDays: number;
}

export interface ConfirmationTagSettings {
  confirmed: string[];
  cancelled: string[];
  pending: string[];
  noAnswer: string[];
  unreachable: string[];
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

// ---- Dashboard ----

export interface RateFigure {
  count: number;
  of: number;
  /** Null when there is nothing to divide. */
  rate: number | null;
}

/** The dashboard's headline figures for one period and brand. Money is integer paisa in strings. */
export interface DashboardData {
  period: { from: string | null; to: string | null; asOf: string; store: StoreKey | null };
  deliveredRevenue: { parcels: string; consignment: string; total: string; parcelCount: number };
  profit: { income: string; expenses: string; netProfit: string };
  returnRate: RateFigure;
  deliverySuccess: {
    counts: { booked: number; delivered: number; returned: number; cancelled: number; inFlight: number; deliveredFirstAttempt: number };
    success: RateFigure;
    firstAttempt: RateFigure;
  };
  cash: { asOf: string; buckets: Array<{ bucket: '0-7' | '8-14' | '15-30' | '31+' | 'no_sale'; parcels: number; amount: string }>; awaiting: string; owedToPostex: string };
  profitPerParcel: { parcels: number; total: string; average: string | null };
}

export interface ReturnRateRow {
  key: string;
  label: string;
  delivered: number;
  returned: number;
  of: number;
  rate: number;
}

// ---- Ledger and reports ----

/** One journal line behind a report figure. Amounts are integer paisa in decimal strings. */
export interface JournalLine {
  lineId: string;
  entryId: string;
  date: string;
  memo: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  originType: string;
  originId: string;
  shipmentId: string | null;
  isReversal: boolean;
  /** The entry has since been reversed by another. */
  reversed: boolean;
  /** Running balance, only when the page is one account's ledger. */
  balance: string | null;
}

export interface JournalLinesPage {
  total: number;
  page: number;
  pageSize: number;
  /** Over every line of the filter, not just this page. */
  debit: string;
  credit: string;
  opening: string | null;
  closing: string | null;
  lines: JournalLine[];
}

export interface PnlRow {
  month: string | null;
  code: string;
  name: string;
  type: 'income' | 'expense';
  amount: string;
}

export interface Pnl {
  rows: PnlRow[];
  income: string;
  expenses: string;
  netProfit: string;
}

export interface TrialBalanceReportRow {
  code: string;
  name: string;
  type: string;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
}

export interface TrialBalanceReport {
  rows: TrialBalanceReportRow[];
  debit: string;
  credit: string;
  balanced: boolean;
}

export interface PartnerLedgerRow {
  partnerType: 'postex_account' | 'retail_partner' | 'vendor';
  partnerId: string;
  name: string;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
}

export interface EntryDetail {
  id: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string;
  postedAt: string;
  postedBy: string | null;
  reversesId: string | null;
  reversedBy: string | null;
  /** Set when the entry's month is closed. */
  periodClosedAt: string | null;
  lines: Array<{ id: string; code: string; name: string; debit: string; credit: string; store: StoreKey | null; partnerType: string | null; partnerId: string | null; partner: string | null; memo: string | null }>;
}

/** What names the journal lines a figure is made of: the filter the lines endpoint takes. */
export interface DrillSpec {
  account?: string;
  partnerType?: PartnerLedgerRow['partnerType'];
  partnerId?: string;
  originType?: string;
  originId?: string;
  originIdPrefix?: string;
  payoutId?: string;
  month?: string;
}

export interface InvoiceRow {
  id: string;
  number: string;
  partnerId: string;
  partner: string;
  store: StoreKey;
  issuedOn: string;
  total: string;
  voidedAt: string | null;
  drill: Pick<DrillSpec, 'originType' | 'originIdPrefix'> | null;
}

export interface PaymentRow {
  kind: 'vendor_payment' | 'postex_payout';
  id: string;
  direction: 'in' | 'out';
  counterparty: string;
  document: string | null;
  amount: string;
  paidOn: string;
  method: string | null;
  reference: string | null;
  drill: Pick<DrillSpec, 'originType' | 'originId' | 'payoutId'>;
}

export interface PagedRows<T> {
  total: number;
  page: number;
  pageSize: number;
  rows: T[];
}

// ---- Stock moves ----

export interface StockMoveEnd {
  key: string | null;
  kind: string;
  label: string;
}

export interface StockMove {
  id: string;
  qty: number;
  from: StockMoveEnd;
  to: StockMoveEnd;
  reason: string;
  refType: string;
  refId: string;
  shipmentId: string | null;
  trackingNumber: string | null;
  actor: string | null;
  occurredAt: string;
  note: string | null;
}

export interface StockMovePage {
  moves: StockMove[];
  nextBefore: string | null;
}

// ---- Consignment ----

/** Amounts are integer paisa in decimal strings. */
export interface Partner {
  id: string;
  name: string;
  city: string | null;
  contact: string | null;
  phone: string | null;
  terms: string | null;
  isActive: boolean;
  /** Units of ours at the partner now. */
  units: number;
  receivable: string;
}

export interface PartnerHolding {
  variantId: string;
  store: StoreKey;
  sku: string | null;
  title: string;
  qty: number;
}

export interface SheetRowReport {
  /** The line in the file, the header being line 1. */
  row: number;
  ok: boolean;
  errors: string[];
}

export interface SheetReport {
  fileSha256: string;
  fileErrors: string[];
  rows: SheetRowReport[];
  valid: number;
  invalid: number;
  units: number;
  net: string;
  tax: string;
  cost: string;
  alreadyImported: { importId: string; version: number; importedAt: string } | null;
}

export interface ImportCommitResult {
  importId: string;
  version: number;
  rowsImported: number;
  rowsSkipped: number;
  invoices: Array<{ id: string; number: string; store: string; total: string }>;
}

export interface PartnerImport {
  id: string;
  partnerId: string;
  partner: string;
  fileName: string;
  version: number;
  rowsTotal: number;
  rowsImported: number;
  forced: boolean;
  importedBy: string;
  importedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  net: string;
}

// ---- Purchasing ----

export interface Vendor {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  leadTimeDays: number | null;
  paymentTermsDays: number | null;
  notes: string | null;
  isActive: boolean;
  payable: string;
  receivedNotBilled: string;
}

export interface PurchaseRequest {
  id: string;
  variantId: string;
  store: StoreKey;
  sku: string | null;
  title: string;
  qty: number;
  reason: string | null;
  requestedBy: string;
  requestedAt: string;
  status: 'cancelled' | 'ordered' | 'quoted' | 'open';
  quotes: number;
}

export interface QuoteComparison {
  quotationId: string;
  quotationLineId: string;
  vendorId: string;
  vendor: string;
  receivedOn: string;
  validUntil: string | null;
  expired: boolean;
  qty: number;
  unitPrice: string;
}

export type OrderStatus = 'cancelled' | 'ordered' | 'partially_received' | 'received' | 'billed' | 'paid';

export interface PurchaseOrderSummary {
  id: string;
  number: string;
  vendorId: string;
  vendor: string;
  store: StoreKey;
  orderedOn: string;
  expectedOn: string | null;
  status: OrderStatus;
  ordered: number;
  received: number;
  billed: number;
  total: string;
  billTotal: string;
  paid: string;
}

export interface PurchaseOrderLine {
  id: string;
  variantId: string;
  sku: string | null;
  title: string;
  qty: number;
  unitCost: string;
  received: number;
  billed: number;
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  note: string | null;
  lines: PurchaseOrderLine[];
  receipts: Array<{ id: string; receivedAt: string; receivedBy: string; lines: Array<{ poLineId: string; qty: number; costWritten: string | null }> }>;
  bills: Array<{ id: string; billNumber: string; billDate: string; dueOn: string | null; total: string; paid: string; matches: boolean; mismatches: string[] }>;
}

export interface VendorBill {
  id: string;
  vendorId: string;
  vendor: string;
  poId: string;
  poNumber: string;
  billNumber: string;
  billDate: string;
  dueOn: string | null;
  total: string;
  paid: string;
  outstanding: string;
  overdue: boolean;
}

export interface ReorderSuggestion {
  variantId: string;
  store: StoreKey;
  sku: string | null;
  title: string;
  delivered: number;
  windowDays: number;
  dailyVelocity: number;
  warehouse: number;
  onOrder: number;
  openRequests: number;
  daysOfCover: number | null;
  leadTimeDays: number;
  suggestedQty: number;
  lastVendor: { id: string; name: string; unitCost: string } | null;
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
