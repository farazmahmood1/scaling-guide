import { describe, expect, it } from 'vitest';

import { STEPS, billDefaults, paisaDigits, toBill, toReceive, wholeUnits } from '@/lib/purchasing';

const line = (over: Partial<{ id: string; qty: number; received: number; billed: number; unitCost: string }> = {}) => ({
  id: '1',
  variantId: '9',
  sku: 'S',
  title: 'T',
  qty: 10,
  unitCost: '150000',
  received: 0,
  billed: 0,
  ...over,
});

describe('purchasing', () => {
  it('has the five steps in order', () => {
    expect(STEPS.map((s) => s.key)).toEqual(['requests', 'quotes', 'orders', 'receive', 'bills']);
  });

  it('knows what is still to receive and still to bill, never below zero', () => {
    expect(toReceive(line({ received: 4 }))).toBe(6);
    expect(toReceive(line({ received: 12 }))).toBe(0);
    expect(toBill(line({ received: 6, billed: 2 }))).toBe(4);
    expect(toBill(line({ received: 2, billed: 5 }))).toBe(0);
  });

  it('reads units as whole numbers only', () => {
    expect(wholeUnits('12')).toBe(12);
    expect(wholeUnits(' ')).toBe(0);
    for (const bad of ['1.5', '-2', '1e3', 'ten', '12345678']) expect(wholeUnits(bad)).toBeNull();
  });

  it('sends amounts as paisa digits only', () => {
    expect(paisaDigits('150000')).toBe('150000');
    expect(paisaDigits('-5')).toBeNull();
    expect(paisaDigits('12.5')).toBeNull();
    expect(paisaDigits(null)).toBeNull();
  });

  it('starts a bill from what arrived and is not billed, at the order prices', () => {
    expect(billDefaults([line({ id: 'a', received: 6, billed: 2 }), line({ id: 'b', received: 0 }), line({ id: 'c', received: 3, billed: 3 })])).toEqual([
      { poLineId: 'a', qty: 4, unitPaisa: '150000' },
    ]);
  });
});
