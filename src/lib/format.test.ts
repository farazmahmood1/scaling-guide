import { describe, expect, it } from 'vitest';

import type { ReviewItem } from '@/lib/api';
import { describeItem, formatPaisa, kindLabel, paisaToInput, parsePrefixes, parseRupees, percent } from '@/lib/format';

const item = (kind: string, detail: Record<string, unknown>): ReviewItem => ({
  id: '1',
  kind,
  severity: 'warning',
  status: 'open',
  storeKey: 'nur',
  orderId: null,
  orderNumber: null,
  shipmentId: '9',
  trackingNumber: '20000000000001',
  detail,
  note: null,
  resolvedBy: null,
  createdAt: '2026-09-20T06:00:00Z',
  resolvedAt: null,
});

describe('formatPaisa', () => {
  it('formats integer paisa exactly, with grouping and sign', () => {
    expect(formatPaisa('275050')).toBe('Rs 2,750.50');
    expect(formatPaisa('20900900')).toBe('Rs 209,009.00');
    expect(formatPaisa('5')).toBe('Rs 0.05');
    expect(formatPaisa('-100')).toBe('−Rs 1.00');
    expect(formatPaisa('900719925474099312')).toBe('Rs 9,007,199,254,740,993.12');
  });

  it('shows a dash for anything that is not an integer string', () => {
    expect(formatPaisa(null)).toBe('—');
    expect(formatPaisa('12.5')).toBe('—');
  });
});

describe('describeItem', () => {
  it('explains each queue kind in one sentence', () => {
    expect(describeItem(item('unmatched_shipment', { orderRefNumber: 'JO-12', reason: 'foreign_ref_prefix' }))).toBe(
      'Reference "JO-12": the reference has a prefix this store does not use',
    );
    expect(describeItem(item('cod_mismatch', { codPaisa: '275000', expectedPaisa: '275100', zeroCod: false }))).toBe(
      'PostEx collects Rs 2,750.00, the order says Rs 2,751.00',
    );
    expect(describeItem(item('possible_duplicate_booking', { orderNumber: '#1201', trackingNumbers: ['A', 'B'] }))).toBe(
      '2 live parcels for #1201: A, B',
    );
    expect(describeItem(item('stuck_in_transit', { days: 9, statusCode: '0008' }))).toBe('No status change for 9 days (last code 0008)');
    expect(describeItem(item('postex_unknown_status', { code: '0099' }))).toBe('Code 0099 is not a code we know yet');
  });

  it('falls back to the plain fields for kinds it does not know', () => {
    expect(describeItem(item('something_new', { orderNumber: '#5', count: 2, nested: { a: 1 } }))).toBe('orderNumber: #5 · count: 2');
    expect(kindLabel('something_new')).toBe('something new');
  });
});

describe('parsePrefixes', () => {
  it('normalises and de-duplicates', () => {
    expect(parsePrefixes(' nbj, NB  nbj ')).toEqual(['NBJ', 'NB']);
    expect(parsePrefixes('')).toEqual([]);
  });

  it('refuses anything but 1–6 letters', () => {
    expect(parsePrefixes('NBJ-1')).toBeNull();
    expect(parsePrefixes('TOOLONGX')).toBeNull();
  });
});

describe('percent', () => {
  it('shows one decimal', () => {
    expect(percent(0.046)).toBe('4.6%');
  });
});

describe('parseRupees', () => {
  it('reads typed rupees as exact paisa', () => {
    expect(parseRupees('1,234.5')).toBe('123450');
    expect(parseRupees('Rs 12,000.00')).toBe('1200000');
    expect(parseRupees('-300')).toBe('-30000');
    expect(parseRupees('0.07')).toBe('7');
    expect(parseRupees('9007199254740993.12')).toBe('900719925474099312');
    expect(parseRupees('-0')).toBe('0');
  });

  it('refuses more than two decimals, letters and blanks', () => {
    expect(parseRupees('1.234')).toBeNull();
    expect(parseRupees('12abc')).toBeNull();
    expect(parseRupees('')).toBeNull();
  });

  it('round-trips with paisaToInput', () => {
    for (const paisa of ['0', '5', '150000', '-30000', '900719925474099312']) expect(parseRupees(paisaToInput(paisa))).toBe(paisa);
  });
});
