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
export const describeItem = (item: ReviewItem): string => {
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
