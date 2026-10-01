import type { Quant, StockMove, StoreKey } from '@/lib/api';
import { STATUS_LABELS } from '@/lib/postex';

/**
 * Where units can be, grouped the way a person thinks about them. The parcel-aware places are
 * their own groups, never folded into "stock": a unit with PostEx is not on the shelf, and one
 * PostEx is bringing back is not on the shelf yet either. The sinks (sold, PR, suppliers,
 * counts) are not stock and are left out.
 */
export const BUCKETS = [
  { key: 'warehouse', label: 'On the shelf', hint: 'In our warehouse, ready to sell' },
  { key: 'in_transit', label: 'With PostEx', hint: 'Booked and out, outcome not known yet' },
  { key: 'returning', label: 'Coming back', hint: 'PostEx started or finished a return; not checked in yet' },
  { key: 'partner', label: 'At partners', hint: 'On consignment at retail partners' },
  { key: 'damaged', label: 'Damaged', hint: 'Returned unfit' },
] as const;

export type BucketKey = (typeof BUCKETS)[number]['key'];

const BUCKET_KEYS: ReadonlySet<string> = new Set(BUCKETS.map((b) => b.key));
export const bucketOf = (locationKind: string): BucketKey | null => (BUCKET_KEYS.has(locationKind) ? (locationKind as BucketKey) : null);

export interface StockRow {
  variantId: string;
  store: StoreKey;
  sku: string | null;
  product: string;
  variant: string;
  units: Record<BucketKey, number>;
  /** Which partners hold it, for the "At partners" cell. */
  partners: Array<{ name: string; qty: number }>;
}

const empty = (): Record<BucketKey, number> => ({ warehouse: 0, in_transit: 0, returning: 0, partner: 0, damaged: 0 });

/** One row per product, with its units in each place. A product with stock only in a sink has no row. */
export const pivotQuants = (quants: readonly Quant[]): StockRow[] => {
  const rows = new Map<string, StockRow>();
  for (const q of quants) {
    const bucket = bucketOf(q.location_kind);
    if (!bucket) continue;
    let row = rows.get(q.variant_id);
    if (!row) {
      row = { variantId: q.variant_id, store: q.store, sku: q.sku, product: q.product, variant: q.variant, units: empty(), partners: [] };
      rows.set(q.variant_id, row);
    }
    row.units[bucket] += q.qty;
    if (bucket === 'partner') row.partners.push({ name: q.location.replace(/^Partner:\s*/, ''), qty: q.qty });
  }
  return [...rows.values()];
};

export const totalsOf = (rows: readonly StockRow[]): Record<BucketKey, number> => {
  const total = empty();
  for (const row of rows) for (const b of BUCKETS) total[b.key] += row.units[b.key];
  return total;
};

/** A place's name as a person says it, for a move's two ends. */
export const placeName = (end: { key: string | null; kind: string; label: string }): string => {
  if (end.kind === 'partner') return end.label.replace(/^Partner:\s*/, '');
  const named: Record<string, string> = {
    warehouse: 'Shelf',
    in_transit: 'With PostEx',
    returning: 'Coming back',
    customer: 'Customer',
    marketing: 'PR',
    damaged: 'Damaged',
    supplier: 'Supplier',
    adjustment: 'Count or correction',
  };
  return named[end.kind] ?? end.label;
};

const REASON_WORDS: Record<string, string> = {
  booked: 'Booked with PostEx',
  unlink: 'Parcel unlinked from an order',
  return_restocked: 'Returned parcel checked in: restocked',
  return_damaged: 'Returned parcel checked in: damaged',
  opening_stock: 'Opening stock',
  count: 'Stock count',
  correction: 'Correction',
  damage: 'Damage',
  loss: 'Loss',
  goods_receipt: 'Goods received from a vendor',
  consignment_out: 'Sent to a partner',
  consignment_back: 'Brought back from a partner',
  consignment_sale: 'Partner sold it',
  consignment_sale_reversed: 'Partner sale reversed',
  pr_send: 'PR package sent',
  pr_send_undone: 'PR package send undone',
};

/** Why a unit moved, in words. A PostEx status reason (`postex_0005`) is worded as the status. */
export const reasonWords = (move: Pick<StockMove, 'reason'>): string => {
  const known = REASON_WORDS[move.reason];
  if (known) return known;
  const code = /^postex_(\w+)$/.exec(move.reason)?.[1];
  if (code) return STATUS_LABELS[code] ?? `PostEx status ${code}`;
  return move.reason.replaceAll('_', ' ');
};
