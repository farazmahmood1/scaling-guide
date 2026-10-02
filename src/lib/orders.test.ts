import { describe, expect, it } from 'vitest';

import { defaultQuery } from '@/lib/list-query';
import { ORDER_STATES, ORDER_STATE_LABELS, orderStateText, orderStateTone, ordersPath, paymentText } from '@/lib/orders';

describe('order states in words', () => {
  it('labels every state, and a state not worked out yet is a dash', () => {
    for (const state of ORDER_STATES) expect(ORDER_STATE_LABELS[state]).toBeTruthy();
    expect(orderStateText('ready_to_book')).toBe('Ready to book');
    expect(orderStateText(null)).toBe('—');
  });

  it('marks the outcomes that need a look as destructive', () => {
    expect(orderStateTone('delivered')).toBe('default');
    for (const state of ['failed', 'returning', 'returned_received', 'cancelled'] as const) expect(orderStateTone(state)).toBe('destructive');
    expect(orderStateTone('placed')).toBe('secondary');
    expect(orderStateTone(null)).toBe('secondary');
  });

  it('writes Shopify payment statuses as words', () => {
    expect(paymentText('partially_paid')).toBe('Partially paid');
    expect(paymentText(null)).toBe('—');
  });
});

describe('ordersPath', () => {
  const spec = { multi: {}, sortKeys: ['placedAt'], defaultSort: { key: 'placedAt', dir: 'desc' as const }, pageSizes: [25], defaultPageSize: 25, columnKeys: [] };

  it('is the plain first page for an untouched view', () => {
    expect(ordersPath(defaultQuery(spec))).toBe('/api/v1/orders?sort=placedAt%3Adesc&page=1&size=25');
  });

  it('carries search, filters, days and sort under the names the URL uses', () => {
    const query = { ...defaultQuery(spec), search: '#1001', from: '2026-09-01', to: '2026-09-30', multi: { state: ['placed', 'confirmed'], city: ['Lahore'], flag: ['no_parcel'] }, sort: { key: 'total', dir: 'asc' as const } };
    const params = new URLSearchParams(ordersPath(query, { page: 3, pageSize: 200 }).split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({ q: '#1001', state: 'placed,confirmed', city: 'Lahore', flag: 'no_parcel', from: '2026-09-01', to: '2026-09-30', sort: 'total:asc', page: '3', size: '200' });
  });
});
