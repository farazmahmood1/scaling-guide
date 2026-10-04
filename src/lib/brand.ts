import type { StoreKey } from '@/lib/api';
import type { ListQuery } from '@/lib/list-query';

/** The brand every screen is narrowed to, chosen once in the sidebar. `null` is both brands. */
export type Brand = StoreKey | null;

export const BRAND_OPTIONS = [
  { key: 'both', label: 'Both brands' },
  { key: 'nur', label: 'NUR by Juggun' },
  { key: 'organics', label: "Juggun's Organics" },
] as const;

export type BrandOptionKey = (typeof BRAND_OPTIONS)[number]['key'];

/**
 * A brand as stored or as written in an older link (`?store=nur`). Anything but exactly one brand,
 * such as `nur,organics` from a list's old Store filter, or nothing at all, is both.
 */
export const parseBrand = (text: string | null | undefined): Brand => (text === 'nur' || text === 'organics' ? text : null);

export const brandLabel = (brand: Brand): string => BRAND_OPTIONS.find((o) => o.key === (brand ?? 'both'))!.label;

/** A list view narrowed to one brand, in the `store` filter the list APIs read. Both brands is no filter. */
export const withBrand = (query: ListQuery, brand: Brand): ListQuery => (brand ? { ...query, multi: { ...query.multi, store: [brand] } } : query);
