import { describe, expect, it } from 'vitest';

import { hrefFor, parseRoute } from '@/lib/route';

describe('parseRoute', () => {
  it('reads the page from the hash, ignoring a trailing path or query', () => {
    expect(parseRoute('#/returns')).toBe('returns');
    expect(parseRoute('#/reconciliation?kind=cod_mismatch')).toBe('reconciliation');
    expect(parseRoute('#inventory/x')).toBe('inventory');
  });

  it('falls back to the overview for an empty or unknown hash', () => {
    expect(parseRoute('')).toBe('overview');
    expect(parseRoute('#/profit')).toBe('overview');
  });

  it('round-trips with hrefFor', () => {
    for (const page of ['overview', 'reconciliation', 'returns', 'inventory'] as const) expect(parseRoute(hrefFor(page))).toBe(page);
  });
});
