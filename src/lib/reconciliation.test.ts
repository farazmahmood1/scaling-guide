import { describe, expect, it } from 'vitest';

import { RULE_KINDS, bySeverity, confidencePercent, dropOne, duplicateParcels, explainMatch, orderKinds, profileFor } from '@/lib/reconciliation';

describe('the five rule kinds', () => {
  it('each has its own question, decision wording and action set', () => {
    const profiles = RULE_KINDS.map(profileFor);
    expect(new Set(profiles.map((p) => p.question)).size).toBe(5);
    expect(new Set(profiles.map((p) => p.resolve.label)).size).toBe(5);
    expect(new Set(profiles.map((p) => p.ignore.label)).size).toBe(5);
    // Only an unmatched parcel can be linked to an order, and only a matched one unlinked.
    expect(profiles.filter((p) => p.actions.includes('link')).map((p) => p.kind)).toEqual(['unmatched_shipment']);
    expect(profiles.some((p) => p.actions.includes('unlink'))).toBe(false);
    expect(profileFor('match_suggested').actions).toContain('unlink');
    for (const p of profiles) expect(p.actions).toContain('ignore');
  });

  it('still presents a kind it does not know', () => {
    const p = profileFor('something_new');
    expect(p.title).toBe('something new');
    expect(p.actions).toEqual(['resolve', 'ignore']);
  });
});

describe('queue order', () => {
  it('puts the five rules first, in rule order', () => {
    expect(orderKinds(['zzz', 'stuck_in_transit', 'match_suggested', 'unmatched_shipment', 'cod_mismatch'])).toEqual([
      'unmatched_shipment',
      'cod_mismatch',
      'stuck_in_transit',
      'match_suggested',
      'zzz',
    ]);
  });

  it('puts the worst severity first and keeps the API order within one', () => {
    const items = [
      { id: 'a', severity: 'info' as const },
      { id: 'b', severity: 'warning' as const },
      { id: 'c', severity: 'error' as const },
      { id: 'd', severity: 'warning' as const },
    ];
    expect(bySeverity(items).map((i) => i.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('duplicate bookings', () => {
  it('pairs each parcel id with its own tracking number', () => {
    expect(duplicateParcels({ parcels: [{ id: '5', trackingNumber: 'B' }, { id: '3', trackingNumber: 'A' }] })).toEqual([
      { id: '5', trackingNumber: 'B' },
      { id: '3', trackingNumber: 'A' },
    ]);
  });

  it('falls back to the bare numbers for an item written before ids were kept', () => {
    expect(duplicateParcels({ trackingNumbers: ['A', 'B'], shipmentIds: ['3', '5'] })).toEqual([
      { id: null, trackingNumber: 'A' },
      { id: null, trackingNumber: 'B' },
    ]);
  });

  it('survives malformed detail', () => {
    expect(duplicateParcels({})).toEqual([]);
    expect(duplicateParcels({ parcels: 'x' })).toEqual([]);
    expect(duplicateParcels({ parcels: [null, 7, { id: 4 }, { trackingNumber: 'T' }] })).toEqual([{ id: null, trackingNumber: 'T' }]);
  });
});

describe('closing an item', () => {
  it('counts one fewer, and drops a kind with none left', () => {
    expect(dropOne({ cod_mismatch: 3, stuck_in_transit: 1 }, 'cod_mismatch')).toEqual({ cod_mismatch: 2, stuck_in_transit: 1 });
    expect(dropOne({ cod_mismatch: 1, stuck_in_transit: 1 }, 'cod_mismatch')).toEqual({ stuck_in_transit: 1 });
    expect(dropOne({}, 'cod_mismatch')).toEqual({});
  });
});

describe('the matcher\'s reason and confidence', () => {
  it('says why a parcel was not matched, and what to do', () => {
    const e = explainMatch({ kind: 'unmatched_shipment', detail: { reason: 'foreign_ref_prefix' } })!;
    expect(e.headline).toBe('Not matched: the reference has a prefix this store does not use');
    expect(e.advice).toContain('other brand');
    expect(e.confidence).toBeNull();
  });

  it('says how a weak match was made and how sure the matcher was', () => {
    const e = explainMatch({ kind: 'match_suggested', detail: { method: 'cod_city_window', confidence: 0.8 } })!;
    expect(e.headline).toContain('same COD to the paisa');
    expect(confidencePercent(e.confidence!)).toBe('80%');
  });

  it('survives a missing reason, a method it does not know and a confidence that is not a number', () => {
    expect(explainMatch({ kind: 'unmatched_shipment', detail: {} })!.headline).toContain('no reason on record');
    expect(explainMatch({ kind: 'match_suggested', detail: { method: 'new_method', confidence: 'high' } })).toMatchObject({ headline: 'Matched by new method', confidence: null });
  });

  it('explains nothing for kinds the matcher did not write', () => {
    expect(explainMatch({ kind: 'cod_mismatch', detail: {} })).toBeNull();
  });
});
