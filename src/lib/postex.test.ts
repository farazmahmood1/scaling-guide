import { describe, expect, it } from 'vitest';

import { emptyPending, fail, start, stillWaiting, succeed, withPending } from '@/lib/check-in';
import { STATUS_LABELS, describeStatus, parcelsPath } from '@/lib/postex';

describe('PostEx statuses in words', () => {
  it('labels every verified code', () => {
    for (const code of ['0002', '0005', '0006', '0008', '0013', '0040']) {
      const text = describeStatus(code, 'anything');
      expect(text.known).toBe(true);
      expect(text.label).toBe(STATUS_LABELS[code]);
    }
    expect(describeStatus(null).label).toBe('Booked, not yet moving');
  });

  it('gives the reason of a failed attempt', () => {
    expect(describeStatus('0013', 'Attempt Made: RFD(REFUSED TO RECEIVE)').reason).toBe('Customer refused');
    expect(describeStatus('0013', 'Attempt Made: CNA(CUSTOMER NOT AVAILABLE)').reason).toBe('Customer not available');
    expect(describeStatus('0013', 'Attempt Made').reason).toBeNull();
  });

  it('renders a code it does not know with PostEx\'s own words, marked unknown', () => {
    expect(describeStatus('0099', 'Shifted to hub')).toEqual({ label: 'Shifted to hub (code 0099)', known: false, reason: null });
    expect(describeStatus('7777', '')).toEqual({ label: 'Status code 7777', known: false, reason: null });
  });
});

describe('optimistic check-in', () => {
  const rows = [
    { id: '1', checkedIn: null },
    { id: '2', checkedIn: null },
    { id: '3', checkedIn: 'damaged' as const },
  ];

  it('shows the outcome at once, and keeps it once the server agrees', () => {
    let p = start(emptyPending(), '1', 'restocked');
    expect(withPending(rows, p).map((r) => r.checkedIn)).toEqual(['restocked', null, 'damaged']);
    expect(stillWaiting(['1', '2'], p)).toBe(1);
    p = succeed(p, '1');
    expect(withPending(rows, p)[0]!.checkedIn).toBe('restocked');
    expect(p.inFlight).toEqual([]);
  });

  it('rolls back when the server refuses', () => {
    let p = start(emptyPending(), '2', 'damaged');
    expect(withPending(rows, p)[1]!.checkedIn).toBe('damaged');
    p = fail(p, '2');
    expect(withPending(rows, p).map((r) => r.checkedIn)).toEqual([null, null, 'damaged']);
    expect(stillWaiting(['1', '2'], p)).toBe(2);
  });

  it('ignores a second click while the first is out', () => {
    const p = start(start(emptyPending(), '1', 'restocked'), '1', 'damaged');
    expect(p.shown['1']).toBe('restocked');
    expect(p.inFlight).toEqual(['1']);
  });
});

describe('parcels API address', () => {
  it('carries the list view\'s filters, sort and page in the API\'s names', () => {
    const path = parcelsPath({
      search: '#1042',
      from: '2026-09-01',
      to: '2026-09-30',
      multi: { stage: ['returned', 'returning'], city: ['Lahore'] },
      page: 2,
      pageSize: 50,
      sort: { key: 'days', dir: 'desc' },
      hidden: [],
    });
    const params = new URL(path, 'http://x').searchParams;
    expect(Object.fromEntries(params)).toEqual({ q: '#1042', stage: 'returned,returning', city: 'Lahore', from: '2026-09-01', to: '2026-09-30', sort: 'days:desc', page: '2', size: '50' });
  });
});
