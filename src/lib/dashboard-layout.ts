import type { Permission } from '@/lib/api';

/**
 * Where each dashboard card sits, per screen size. The grid is measured by the room the page has
 * (the sidebar already taken out), not by the window, so it also adapts when the sidebar or a
 * narrow column changes that room. Pure: the defaults, what is allowed, and how a saved layout is
 * trusted, apart from how it is drawn or where it is kept.
 */

export const CARD_IDS = [
  'revenue',
  'profit',
  'returnRate',
  'deliverySuccess',
  'cash',
  'profitPerParcel',
  'trend',
  'ageing',
  'returnTrend',
  'cityReturns',
  'funnel',
  'queue',
  'topProducts',
  'recentOrders',
  'alerts',
  'connections',
] as const;
export type CardId = (typeof CARD_IDS)[number];

/** The permission a card needs, when it needs one beyond seeing the dashboard. */
const NEEDS: Partial<Record<CardId, Permission>> = {
  queue: 'confirmations.work',
  topProducts: 'reports.read',
  recentOrders: 'reports.read',
};

/** The cards a role may see, in default order. */
export const visibleCards = (can: (permission: Permission) => boolean): CardId[] => CARD_IDS.filter((id) => !NEEDS[id] || can(NEEDS[id]));

// ---- Screen sizes ----

export const BREAKPOINT_KEYS = ['lg', 'md', 'sm', 'xs'] as const;
export type BreakpointKey = (typeof BREAKPOINT_KEYS)[number];

/** Narrowest width of the grid's own container for each size. */
export const BREAKPOINTS: Record<BreakpointKey, number> = { lg: 1000, md: 680, sm: 440, xs: 0 };
export const COLS: Record<BreakpointKey, number> = { lg: 12, md: 8, sm: 4, xs: 1 };
/** Rows are fine (10px) so a card can be dragged to nearly any height, with 16px between cards. */
export const ROW_HEIGHT = 10;
export const MARGIN = [16, 16] as const;

export interface CardPlace {
  i: CardId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
}
export type Layouts = Record<BreakpointKey, CardPlace[]>;

/** Width in columns, then height in rows, at each size. */
type Size = Record<BreakpointKey, readonly [number, number]>;

const tile: Size = { lg: [4, 9], md: [4, 10], sm: [2, 12], xs: [1, 10] };
const SIZES: Record<CardId, Size> = {
  revenue: tile,
  profit: tile,
  returnRate: tile,
  deliverySuccess: tile,
  cash: tile,
  profitPerParcel: tile,
  trend: { lg: [8, 16], md: [8, 16], sm: [4, 16], xs: [1, 16] },
  ageing: { lg: [4, 16], md: [4, 16], sm: [4, 16], xs: [1, 16] },
  returnTrend: { lg: [4, 18], md: [4, 18], sm: [4, 16], xs: [1, 16] },
  cityReturns: { lg: [8, 18], md: [4, 18], sm: [4, 18], xs: [1, 18] },
  funnel: { lg: [12, 14], md: [8, 14], sm: [4, 14], xs: [1, 14] },
  queue: { lg: [8, 18], md: [8, 18], sm: [4, 18], xs: [1, 20] },
  topProducts: { lg: [4, 18], md: [8, 16], sm: [4, 16], xs: [1, 16] },
  recentOrders: { lg: [12, 20], md: [8, 20], sm: [4, 22], xs: [1, 24] },
  alerts: { lg: [4, 22], md: [4, 22], sm: [4, 22], xs: [1, 22] },
  connections: { lg: [8, 14], md: [4, 22], sm: [4, 18], xs: [1, 24] },
};

/** Smallest a card can be dragged to: wide enough for its title, tall enough for a line of figures. */
const MIN_W: Record<BreakpointKey, number> = { lg: 3, md: 3, sm: 2, xs: 1 };
const MIN_H = 7;

/** Cards placed left to right in the order given, wrapping when a row is full. */
export const defaultLayouts = (ids: readonly CardId[] = CARD_IDS): Layouts => {
  const out = {} as Layouts;
  for (const bp of BREAKPOINT_KEYS) {
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    out[bp] = ids.map((i) => {
      const [w, h] = SIZES[i][bp];
      if (x + w > COLS[bp]) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      const place = { i, x, y, w, h, minW: Math.min(MIN_W[bp], w), minH: Math.min(MIN_H, h) };
      x += w;
      rowHeight = Math.max(rowHeight, h);
      return place;
    });
  }
  return out;
};

// ---- A saved layout ----

const whole = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;

/**
 * A layout read back from storage, trusted only as far as it checks out. Anything malformed, or
 * for a card that no longer exists, is dropped; a card with no valid saved place gets its default
 * one (so a card added later appears), and one wider than the screen is narrowed to fit. Never
 * throws: a damaged value is the same as none.
 */
export const mergeLayouts = (saved: unknown, ids: readonly CardId[]): Layouts => {
  const defaults = defaultLayouts(ids);
  if (!saved || typeof saved !== 'object') return defaults;
  const out = {} as Layouts;
  for (const bp of BREAKPOINT_KEYS) {
    const raw = (saved as Record<string, unknown>)[bp];
    const kept = new Map<CardId, CardPlace>();
    for (const item of Array.isArray(raw) ? raw : []) {
      if (!item || typeof item !== 'object') continue;
      const { i, x, y, w, h } = item as Record<string, unknown>;
      const id = ids.find((c) => c === i);
      const width = whole(w, 1, COLS[bp]);
      const height = whole(h, 1, 200);
      const left = whole(x, 0, COLS[bp] - 1);
      const top = whole(y, 0, 10_000);
      if (!id || width === null || height === null || left === null || top === null || kept.has(id)) continue;
      kept.set(id, { i: id, x: Math.min(left, COLS[bp] - width), y: top, w: width, h: height, minW: Math.min(MIN_W[bp], width), minH: Math.min(MIN_H, height) });
    }
    // Every card is placed; one with no saved place keeps its default.
    out[bp] = defaults[bp].map((d) => kept.get(d.i) ?? d);
  }
  return out;
};

/** What is kept: only the shape, none of the limits, which are re-derived on the way back in. */
export const toSaved = (layouts: Layouts): Record<BreakpointKey, Array<Pick<CardPlace, 'i' | 'x' | 'y' | 'w' | 'h'>>> => {
  const out = {} as ReturnType<typeof toSaved>;
  for (const bp of BREAKPOINT_KEYS) out[bp] = layouts[bp].map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  return out;
};

// ---- Where it is kept ----

const KEY = 'nur.dashboard-layout.v1';
const keyFor = (person: string | undefined) => `${KEY}:${person ?? ''}`;

/** The layout this person saved on this browser, or nothing. Storage can refuse; that is nothing too. */
export const readSavedLayout = (person: string | undefined): unknown => {
  try {
    const text = localStorage.getItem(keyFor(person));
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

export const writeSavedLayout = (person: string | undefined, layouts: Layouts | null): void => {
  try {
    if (layouts) localStorage.setItem(keyFor(person), JSON.stringify(toSaved(layouts)));
    else localStorage.removeItem(keyFor(person));
  } catch {
    // The layout then lasts until the page is closed.
  }
};
