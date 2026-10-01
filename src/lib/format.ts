import type { ReviewItem } from '@/lib/api';

/**
 * Integer paisa (a decimal string from the API) as rupees, e.g. `275050` → `Rs 2,750.50`.
 * Done on the digits, never through a float, so no amount is ever rounded on screen.
 */
export const formatPaisa = (paisa: string | null | undefined): string => {
  if (paisa === null || paisa === undefined || !/^-?\d+$/.test(paisa)) return '—';
  const negative = paisa.startsWith('-');
  const digits = (negative ? paisa.slice(1) : paisa).padStart(3, '0');
  const rupees = digits.slice(0, -2).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}Rs ${rupees}.${digits.slice(-2)}`;
};

export const KIND_LABELS: Record<string, string> = {
  unmatched_shipment: 'Parcel without an order',
  match_suggested: 'Matched by COD or phone: check',
  cod_mismatch: 'COD differs from the order',
  possible_duplicate_booking: 'Possible duplicate booking',
  stuck_in_transit: 'Stuck in transit',
  postex_unknown_status: 'Unknown PostEx status',
  stock_unmapped_line: 'Order line with no product',
  payout_without_cpr: 'Paid out without a receipt',
  shopify_order_skipped: 'Shopify order not stored',
  gdpr_data_request: 'Customer data request',
  confirmed_not_booked: 'Confirmed, not booked',
  cancelled_but_booked: 'Cancelled, but booked',
};

export const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind.replaceAll('_', ' ');

const REASONS: Record<string, string> = {
  account_has_no_store: 'the PostEx account has no store',
  foreign_ref_prefix: 'the reference has a prefix this store does not use',
  order_ref_not_found: 'no order has this number',
  ambiguous: 'several orders fit equally',
  no_candidate_matched: 'no order fits by number, COD and city, or phone',
};

const text = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

/** One sentence saying what the item is about, from the fields each job writes. */
export const describeItem = (item: Pick<ReviewItem, 'kind' | 'detail'>): string => {
  const d = item.detail;
  switch (item.kind) {
    case 'unmatched_shipment': {
      const ref = text(d['orderRefNumber']);
      const reason = REASONS[text(d['reason'])];
      return `Reference ${ref ? `"${ref}"` : 'missing'}${reason ? `: ${reason}` : ''}`;
    }
    case 'match_suggested':
      return `Linked by ${text(d['method']).replaceAll('_', ' ')} (confidence ${text(d['confidence'])})`;
    case 'cod_mismatch':
      return `PostEx collects ${formatPaisa(text(d['codPaisa']))}, the order says ${formatPaisa(text(d['expectedPaisa']))}${d['zeroCod'] ? ' (zero COD: PR, gift or replacement?)' : ''}`;
    case 'possible_duplicate_booking': {
      const numbers = Array.isArray(d['trackingNumbers']) ? (d['trackingNumbers'] as unknown[]).map(text) : [];
      return `${numbers.length} live parcels for ${text(d['orderNumber']) || 'one order'}: ${numbers.join(', ')}`;
    }
    case 'stuck_in_transit':
      return `No status change for ${text(d['days'])} days (last code ${text(d['statusCode']) || 'none'})`;
    case 'confirmed_not_booked':
      return `${text(d['orderNumber'])} confirmed ${text(d['hoursWaiting'])} hours ago and still not booked with PostEx`;
    case 'cancelled_but_booked': {
      const numbers = Array.isArray(d['trackingNumbers']) ? (d['trackingNumbers'] as unknown[]).map(text) : [];
      return `${text(d['orderNumber'])} was cancelled ${d['cancelledBy'] === 'desk' ? 'at the desk' : 'in Shopify'}, but parcel ${numbers.join(', ')} is still out`;
    }
    case 'postex_unknown_status':
      return `Code ${text(d['code'])} "${text(d['message'])}" is not a code we know yet`.replace(' ""', '');
    default:
      return Object.entries(d)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
        .map(([k, v]) => `${k}: ${String(v)}`)
        .slice(0, 3)
        .join(' · ');
  }
};

/** Prefix list typed by a person, e.g. `nbj, NB` → `['NBJ', 'NB']`; null if any entry is not 1–6 letters. */
export const parsePrefixes = (input: string): string[] | null => {
  const parts = input
    .split(/[\s,]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (parts.some((p) => !/^[A-Z]{1,6}$/.test(p))) return null;
  return [...new Set(parts)];
};

export const percent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

/**
 * What a person types as rupees (`1,234.5`, `-300`, `Rs 12,000.00`) as integer paisa in a
 * decimal string, read digit by digit: no float ever holds the amount. Null if it is not an
 * amount with at most two decimals. Blank is null too.
 */
export const parseRupees = (input: string): string | null => {
  const cleaned = input.trim().replace(/^(rs\.?|pkr)\s*/i, '').replaceAll(',', '').replaceAll(' ', '');
  const match = /^(-|−)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const paisa = `${match[2]}${(match[3] ?? '').padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  return match[1] && paisa !== '0' ? `-${paisa}` : paisa;
};

/** Paisa string as a plain rupee amount for an input box: `150000` → `1500.00`, `-5` → `-0.05`. */
export const paisaToInput = (paisa: string): string => {
  const negative = paisa.startsWith('-');
  const digits = (negative ? paisa.slice(1) : paisa).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2).replace(/^0+(?=\d)/, '')}.${digits.slice(-2)}`;
};

// ---- Confirmation Desk ----

export const CONFIRMATION_LABELS: Record<string, string> = {
  pending: 'To contact',
  no_answer: 'No answer',
  unreachable: 'Unreachable',
  confirmed: 'Confirmed',
  changed: 'Confirmed with changes',
  cancelled: 'Cancelled',
};

export const OUTCOME_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  changed: 'Confirmed with changes',
  cancelled: 'Cancelled',
  no_answer: 'No answer',
  callback: 'Call back later',
  wrong_number: 'Wrong or switched-off number',
  rescheduled: 'Follow-up scheduled',
};

const KARACHI = 'Asia/Karachi';
const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: KARACHI,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** What Karachi's clock reads at an instant, as `YYYY-MM-DDTHH:MM` (the shape of a datetime input). */
export const karachiLocal = (iso: string | Date): string => {
  const parts = Object.fromEntries(wallClock.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
};

/**
 * The instant Karachi's clock shows `YYYY-MM-DDTHH:MM`, as ISO. The offset comes from the time
 * zone database through Intl, never a hard-coded +05:00 (the backend's rule 4). Null if the text
 * is not a date and time.
 */
export const karachiToIso = (local: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const offsetAt = (ms: number) => Date.parse(`${karachiLocal(new Date(ms))}:00Z`) - Math.floor(ms / 60_000) * 60_000;
  const first = asUtc - offsetAt(asUtc);
  const instant = new Date(asUtc - offsetAt(first));
  return karachiLocal(instant) === local ? instant.toISOString() : null;
};

const shortTime = new Intl.DateTimeFormat('en-GB', { timeZone: KARACHI, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** `1 Oct, 14:05`, Karachi time. */
export const formatKarachiTime = (iso: string | null): string => (iso ? shortTime.format(new Date(iso)) : '—');

/** `in 40 min`, `3 h ago`, `2 days ago`: how far an instant is from now. */
export const fromNow = (iso: string, now: number = Date.now()): string => {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  const abs = Math.abs(minutes);
  const span = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / (24 * 60))} days`;
  if (abs === 0) return 'now';
  return minutes > 0 ? `in ${span}` : `${span} ago`;
};
