import { describe, expect, it } from 'vitest';

import { returnStageText, shopifyEffect, splitLines, splitProblem } from '@/lib/returns';

const units = [
  { variantId: '1', title: 'Serum', sku: null, qty: 2 },
  { variantId: '2', title: 'Cream', sku: null, qty: 1 },
];

describe('splitLines', () => {
  it('starts with everything fine, and the damaged part is always what is left', () => {
    expect(splitLines(units, {})).toEqual([
      { variantId: '1', restocked: 2, damaged: 0 },
      { variantId: '2', restocked: 1, damaged: 0 },
    ]);
    expect(splitLines(units, { '1': 1 })[0]).toEqual({ variantId: '1', restocked: 1, damaged: 1 });
  });

  it('keeps a typed count within what came back, as a whole number', () => {
    expect(splitLines(units, { '1': 5, '2': -3 }).map((l) => l.restocked)).toEqual([2, 0]);
    expect(splitLines(units, { '1': 1.7 })[0]!.restocked).toBe(1);
    expect(splitLines(units, { '1': Number.NaN })[0]!.restocked).toBe(2);
  });
});

describe('splitProblem', () => {
  it('refuses a split that sends everything one way, which is a plain restock or damaged', () => {
    expect(splitProblem(units, splitLines(units, {}))).toMatch(/Restock/);
    expect(splitProblem(units, splitLines(units, { '1': 0, '2': 0 }))).toMatch(/Damaged/);
    expect(splitProblem(units, splitLines(units, { '1': 1 }))).toBeNull();
  });
});

describe('returnStageText', () => {
  it('names the two stages of a return', () => {
    expect(returnStageText('returning')).toBe('On the way back');
    expect(returnStageText('returned')).toBe('Back with us');
  });
});

describe('shopifyEffect', () => {
  it('names the order and says what is restocked, that nothing is refunded, and that a cancel is final', () => {
    expect(shopifyEffect('#64786', 'restocked')).toBe(
      'In Shopify, #64786 is cancelled with its items restocked if it is still open there, or gets a return recorded the same way if it was fulfilled. No refund, and the customer is not emailed. A cancel cannot be undone in Shopify.',
    );
    expect(shopifyEffect('#1', 'damaged')).toContain('its items not restocked');
    expect(shopifyEffect('#1', 'mixed')).toContain('the good items restocked and the damaged ones not');
  });
});
