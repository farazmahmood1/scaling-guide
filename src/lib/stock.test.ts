import { describe, expect, it } from 'vitest';

import type { Quant } from '@/lib/api';
import { BUCKETS, bucketOf, pivotQuants, placeName, reasonWords, totalsOf } from '@/lib/stock';

const quant = (variant: string, kind: string, qty: number, location = kind): Quant => ({
  variant_id: variant,
  store: 'nur',
  sku: `SKU-${variant}`,
  product: `Product ${variant}`,
  variant: 'Default',
  location_id: kind,
  location,
  location_kind: kind,
  qty,
});

describe('stock by place', () => {
  it('keeps the parcel-aware places apart from the shelf', () => {
    const [row] = pivotQuants([quant('1', 'warehouse', 40), quant('1', 'in_transit', 12), quant('1', 'returning', 3), quant('1', 'damaged', 1)]);
    expect(row?.units).toEqual({ warehouse: 40, in_transit: 12, returning: 3, partner: 0, damaged: 1 });
    // "With PostEx" and "Coming back" are named groups of their own, in that order after the shelf.
    expect(BUCKETS.map((b) => b.label).slice(0, 3)).toEqual(['On the shelf', 'With PostEx', 'Coming back']);
  });

  it('leaves the sinks out: sold, PR, suppliers and counts are not stock', () => {
    const rows = pivotQuants([quant('1', 'warehouse', 5), quant('1', 'customer', 900), quant('1', 'marketing', 4), quant('1', 'supplier', -50), quant('1', 'adjustment', -5)]);
    expect(rows).toHaveLength(1);
    expect(totalsOf(rows).warehouse).toBe(5);
    expect(pivotQuants([quant('2', 'customer', 10)])).toEqual([]);
    expect(bucketOf('customer')).toBeNull();
    expect(bucketOf('something_new')).toBeNull();
  });

  it('one row per product, with the partners that hold it named', () => {
    const rows = pivotQuants([quant('1', 'partner', 4, 'Partner: Green Mart'), quant('1', 'partner', 2, 'Partner: Dayliz'), quant('2', 'warehouse', 7)]);
    expect(rows.map((r) => r.variantId)).toEqual(['1', '2']);
    expect(rows[0]?.units.partner).toBe(6);
    expect(rows[0]?.partners).toEqual([{ name: 'Green Mart', qty: 4 }, { name: 'Dayliz', qty: 2 }]);
  });

  it('keeps negative stock visible: it means the opening count is missing', () => {
    expect(pivotQuants([quant('1', 'warehouse', -3)])[0]?.units.warehouse).toBe(-3);
  });
});

describe('move history in words', () => {
  it('names places for a person', () => {
    expect(placeName({ key: 'in_transit', kind: 'in_transit', label: 'With PostEx, outcome unknown' })).toBe('With PostEx');
    expect(placeName({ key: null, kind: 'partner', label: 'Partner: Green Mart' })).toBe('Green Mart');
    expect(placeName({ key: 'x', kind: 'new_kind', label: 'Somewhere new' })).toBe('Somewhere new');
  });

  it('words a reason, a PostEx status reason and one it does not know', () => {
    expect(reasonWords({ reason: 'booked' })).toBe('Booked with PostEx');
    expect(reasonWords({ reason: 'postex_0005' })).toBe('Delivered');
    expect(reasonWords({ reason: 'postex_0099' })).toBe('PostEx status 0099');
    expect(reasonWords({ reason: 'goods_receipt' })).toBe('Goods received from a vendor');
    expect(reasonWords({ reason: 'some_new_reason' })).toBe('some new reason');
  });
});
