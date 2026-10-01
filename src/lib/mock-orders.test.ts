import { describe, expect, it } from 'vitest';

import { defaultQuery } from '@/lib/list-query';
import { matching, mockOrders, page } from '@/lib/mock-orders';

const spec = { multi: {}, sortKeys: [], defaultSort: null, pageSizes: [25], defaultPageSize: 25, columnKeys: [] };

describe('the demo server', () => {
  const rows = mockOrders();

  it('has 10,000 rows, the same every time', () => {
    expect(rows).toHaveLength(10_000);
    expect(mockOrders()[1234]).toEqual(rows[1234]);
  });

  it('filters, sorts and pages', () => {
    const q = { ...defaultQuery(spec), multi: { status: ['delivered'], city: ['Lahore'] }, from: '2026-03-01', to: '2026-03-31', sort: { key: 'total', dir: 'desc' as const }, page: 2, pageSize: 10 };
    const all = matching(rows, q);
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((r) => r.status === 'delivered' && r.city === 'Lahore')).toBe(true);
    expect(all.every((r, i) => i === 0 || BigInt(all[i - 1]!.totalPaisa) >= BigInt(r.totalPaisa))).toBe(true);
    const second = page(rows, q);
    expect([second.total, second.rows]).toEqual([all.length, all.slice(10, 20)]);
  });

  it('answers a query over all 10,000 rows quickly enough to feel instant', () => {
    const started = performance.now();
    for (let i = 0; i < 20; i++) page(rows, { ...defaultQuery(spec), search: 'customer 1', sort: { key: 'placedAt', dir: 'desc' } });
    expect((performance.now() - started) / 20).toBeLessThan(50);
  });
});
