import { describe, expect, it } from 'vitest';

import { isStatusTag, sameTag, tagTone } from '@/lib/tags';

const NUR = ['✅ Order Confirmed', '⚠ Confirmation Pending', '❌ Order Canceled', 'didnt answer the call'];

describe('Shopify tags on the Confirmations page', () => {
  it('compares tags by their words, not their emoji or spacing', () => {
    expect(sameTag('✅ Order Confirmed', 'order  confirmed')).toBe(true);
    expect(sameTag('COD-Confirmed', 'cod confirmed')).toBe(true);
    expect(sameTag('Order Confirmed', 'Order Canceled')).toBe(false);
  });

  it('knows a status tag from one another app added', () => {
    expect(isStatusTag('Order Confirmed', NUR)).toBe(true);
    expect(isStatusTag('Quoli Influenced Order', NUR)).toBe(false);
  });

  it('colours a decision, and keeps the rest quiet', () => {
    expect(tagTone('✅ Order Confirmed', NUR)).toBe('confirmed');
    expect(tagTone('❌ Order Canceled', NUR)).toBe('cancelled');
    expect(tagTone('didnt answer the call', NUR)).toBe('status');
    expect(tagTone('Loox - Review Request Email', NUR)).toBe('other');
  });
});
