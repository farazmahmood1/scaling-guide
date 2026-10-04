import { describe, expect, it } from 'vitest';

import { decimalNumber, parseTags, rupeesToPaisaNumber, tagsToText, wholeNumber } from '@/lib/settings';

describe('numbers typed into a form', () => {
  it('reads a whole number only inside its range', () => {
    expect(wholeNumber('7', 1, 90)).toBe(7);
    expect(wholeNumber(' 90 ', 1, 90)).toBe(90);
    for (const bad of ['0', '91', '7.5', '-3', '1e2', '', 'seven', '1234567890']) expect(wholeNumber(bad, 1, 90), bad).toBeNull();
  });

  it('reads a percentage to two decimals', () => {
    expect(decimalNumber('2', 0, 50)).toBe(2);
    expect(decimalNumber('2.5', 0, 50)).toBe(2.5);
    for (const bad of ['2.555', '51', '-1', 'x', '']) expect(decimalNumber(bad, 0, 50), bad).toBeNull();
  });

  it('turns typed rupees into exact whole paisa, within a limit', () => {
    expect(rupeesToPaisaNumber('100', 100_000_000)).toBe(10_000);
    expect(rupeesToPaisaNumber('1,000.50', 100_000_000)).toBe(100_050);
    expect(rupeesToPaisaNumber('1000000', 100_000_000)).toBe(100_000_000);
    for (const bad of ['1000001', '-5', '1.234', 'lots', '']) expect(rupeesToPaisaNumber(bad, 100_000_000), bad).toBeNull();
  });
});

describe('Shopify tags', () => {
  it('splits on lines and commas, trims, and drops repeats', () => {
    expect(parseTags('Confirmed, confirmed\n Order Confirmed \n\nConfirmed').tags).toEqual(['Confirmed', 'confirmed', 'Order Confirmed']);
    expect(tagsToText(['a', 'b'])).toBe('a\nb');
  });

  it('refuses more than 30 tags, and one that is too long', () => {
    expect(parseTags(Array.from({ length: 31 }, (_, i) => `t${i}`).join(',')).error).toBe('At most 30 tags');
    expect(parseTags('x'.repeat(81)).error).toContain('longer than 80');
    expect(parseTags('ok').error).toBeNull();
  });
});
