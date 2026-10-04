import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Permission } from '@/lib/api';
import { BREAKPOINT_KEYS, CARD_IDS, COLS, defaultLayouts, mergeLayouts, readSavedLayout, toSaved, visibleCards, writeSavedLayout } from '@/lib/dashboard-layout';

afterEach(() => vi.unstubAllGlobals());

describe('the default layout', () => {
  it('places every card once at every screen size, inside the columns, with no two overlapping', () => {
    const layouts = defaultLayouts();
    for (const bp of BREAKPOINT_KEYS) {
      const places = layouts[bp];
      expect(places.map((p) => p.i).sort()).toEqual([...CARD_IDS].sort());
      for (const p of places) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(COLS[bp]);
      }
      for (const a of places)
        for (const b of places) {
          if (a === b) continue;
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${a.i} and ${b.i} at ${bp}`).toBe(true);
        }
    }
  });

  it('puts three tiles across when wide, two on a tablet and one on a phone', () => {
    const tilesAcross = (bp: (typeof BREAKPOINT_KEYS)[number]) => defaultLayouts()[bp].filter((p) => ['revenue', 'profit', 'returnRate'].includes(p.i)).filter((p) => p.y === 0).length;
    expect(tilesAcross('lg')).toBe(3);
    expect(tilesAcross('md')).toBe(2);
    expect(tilesAcross('xs')).toBe(1);
  });

  it('lays out only the cards given', () => {
    const layouts = defaultLayouts(['revenue', 'queue']);
    for (const bp of BREAKPOINT_KEYS) expect(layouts[bp].map((p) => p.i)).toEqual(['revenue', 'queue']);
  });
});

describe('the cards a role may see', () => {
  const holding =
    (...held: Permission[]) =>
    (p: Permission) =>
      held.includes(p);

  it('leaves out the queue without the desk, and the money lists without reports', () => {
    const none = visibleCards(holding('dashboard.read'));
    for (const hidden of ['queue', 'topProducts', 'recentOrders'] as const) expect(none).not.toContain(hidden);
    expect(none).toContain('alerts');
    expect(visibleCards(holding('confirmations.work'))).toContain('queue');
    expect(visibleCards(holding('reports.read'))).toEqual(expect.arrayContaining(['topProducts', 'recentOrders']));
    expect(visibleCards(() => true)).toEqual([...CARD_IDS]);
  });
});

describe('a saved layout', () => {
  const ids = ['revenue', 'profit', 'trend'] as const;
  const place = (i: string, x: number, y: number, w: number, h: number) => ({ i, x, y, w, h });

  it('is used where it checks out, and the default fills in what it lacks', () => {
    const merged = mergeLayouts({ lg: [place('trend', 4, 2, 8, 12)] }, ids);
    expect(merged.lg.find((p) => p.i === 'trend')).toMatchObject({ x: 4, y: 2, w: 8, h: 12 });
    expect(merged.lg.map((p) => p.i)).toEqual(['revenue', 'profit', 'trend']);
    expect(merged.md).toEqual(defaultLayouts(ids).md);
  });

  it('is the default when there is nothing, or the value is not a layout', () => {
    for (const bad of [null, undefined, 'x', 7, [], { lg: 'no' }, { lg: [null, 3, 'a'] }]) expect(mergeLayouts(bad, ids)).toEqual(defaultLayouts(ids));
  });

  it('drops a card that no longer exists, a place that is not whole numbers, and a card placed twice', () => {
    const merged = mergeLayouts({ lg: [place('gone', 0, 0, 4, 4), place('revenue', 0.5, 0, 4, 4), place('profit', 0, 0, 4, 4), place('profit', 8, 0, 4, 4)] }, ids);
    expect(merged.lg.map((p) => p.i)).toEqual(['revenue', 'profit', 'trend']);
    expect(merged.lg[0]).toEqual(defaultLayouts(ids).lg[0]);
    // The first valid place for a card wins.
    expect(merged.lg[1]).toMatchObject({ x: 0, w: 4 });
  });

  it('never lets a card past the last column, or be wider than the screen', () => {
    const merged = mergeLayouts({ sm: [place('revenue', 3, 0, 2, 4), place('profit', 0, 0, 9, 4)] }, ids);
    const revenue = merged.sm.find((p) => p.i === 'revenue')!;
    expect(revenue.x + revenue.w).toBeLessThanOrEqual(COLS.sm);
    expect(merged.sm.find((p) => p.i === 'profit')).toEqual(defaultLayouts(ids).sm[1]);
  });

  it('keeps only where each card is, not the limits', () => {
    const saved = toSaved(defaultLayouts(ids));
    expect(Object.keys(saved.lg[0]!).sort()).toEqual(['h', 'i', 'w', 'x', 'y']);
  });
});

describe('keeping the layout in the browser', () => {
  const storage = () => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v), removeItem: (k: string) => map.delete(k) });
    return map;
  };

  it('keeps one per person, and forgets it on reset', () => {
    storage();
    writeSavedLayout('a@x.pk', defaultLayouts(['revenue']));
    expect(readSavedLayout('a@x.pk')).not.toBeNull();
    expect(readSavedLayout('b@x.pk')).toBeNull();
    writeSavedLayout('a@x.pk', null);
    expect(readSavedLayout('a@x.pk')).toBeNull();
  });

  it('reads damaged text as nothing, and carries on when storage refuses', () => {
    const map = storage();
    map.set('nur.dashboard-layout.v1:a@x.pk', '{not json');
    expect(readSavedLayout('a@x.pk')).toBeNull();
    const refuse = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse, removeItem: refuse });
    expect(readSavedLayout('a@x.pk')).toBeNull();
    expect(() => writeSavedLayout('a@x.pk', defaultLayouts(['revenue']))).not.toThrow();
  });
});
