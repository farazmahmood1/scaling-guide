import { describe, expect, it } from 'vitest';

import type { PaidOrderRow } from '@/lib/api';
import { PAYMENT_CSV_HEADER, chargesText, chargesTotal, isPaymentWindow, marginText, missingCost, paymentCsvRow, paymentLabel, windowReaching } from '@/lib/payments';

const row = (overrides: Partial<PaidOrderRow> = {}): PaidOrderRow => ({
  orderId: '322',
  orderNumber: '#64638',
  store: 'nur',
  trackingNumbers: ['26632200001195'],
  paidAt: '2026-10-27T07:00:00.000Z',
  cprNumbers: ['CPR-1'],
  payment: '251800',
  cod: '275000',
  deliveryFee: '20000',
  deliveryTax: '3200',
  revenue: '275000',
  goods: '90000',
  other: '0',
  profit: '161800',
  ...overrides,
});

describe('a payment, in words', () => {
  it('writes what PostEx kept as the fee plus its tax, and the fee alone when there is no tax', () => {
    expect(chargesText('20000', '3200')).toBe('Rs 200.00 + Rs 32.00');
    expect(chargesText('20000', '0')).toBe('Rs 200.00');
    expect(chargesTotal('20000', '3200')).toBe('23200');
  });

  it('gives the margin on the sale, and a dash when nothing was sold', () => {
    expect(marginText('161800', '275000')).toBe('58.8%');
    expect(marginText('-17400', '0')).toBe('—');
  });

  it('marks a sale with no cost price, whose profit reads high', () => {
    expect(missingCost(row())).toBe(false);
    expect(missingCost(row({ goods: '0' }))).toBe(true);
    expect(missingCost(row({ goods: '0', revenue: '0' }))).toBe(false);
  });

  it('names a row by its order, else by its parcel', () => {
    expect(paymentLabel(row())).toBe('#64638');
    expect(paymentLabel(row({ orderId: null, orderNumber: null }))).toBe('26632200001195');
  });

  it('exports every column in rupees, one value per header', () => {
    const csv = paymentCsvRow(row());
    expect(csv).toHaveLength(PAYMENT_CSV_HEADER.length);
    expect(csv.slice(5, 11)).toEqual(['2518.00', '2750.00', '200.00', '32.00', '900.00', '1618.00']);
  });

  it('knows its periods, and nothing else', () => {
    expect(['24h', '7d', '14d', '30d'].every(isPaymentWindow)).toBe(true);
    expect(isPaymentWindow('forever')).toBe(false);
    expect(isPaymentWindow(null)).toBe(false);
  });

  it('finds the shortest period that reaches back to a payment, and none past a month', () => {
    const until = '2026-10-27T15:00:00.000Z';
    expect(windowReaching('2026-10-27T03:00:00.000Z', until)?.key).toBe('24h');
    expect(windowReaching('2026-10-23T05:24:12.000Z', until)?.key).toBe('7d');
    expect(windowReaching('2026-10-15T00:00:00.000Z', until)?.key).toBe('14d');
    expect(windowReaching('2026-09-01T00:00:00.000Z', until)).toBeNull();
  });
});
