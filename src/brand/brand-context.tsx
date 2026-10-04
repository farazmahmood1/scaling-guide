import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { type Brand, parseBrand } from '@/lib/brand';

const STORAGE_KEY = 'nur.brand';

interface BrandValue {
  brand: Brand;
  setBrand: (brand: Brand) => void;
}

// Outside the shell (a page rendered on its own, in a test) every screen shows both brands.
const BrandContext = createContext<BrandValue>({ brand: null, setBrand: () => undefined });

// Storage can be missing or refuse (a private window); the choice then lasts until the tab closes.
const stored = (): Brand => {
  try {
    return parseBrand(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};
const store = (brand: Brand): void => {
  try {
    if (brand) localStorage.setItem(STORAGE_KEY, brand);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Kept in memory only.
  }
};

/**
 * The brand chosen in the sidebar, for every screen at once, kept across reloads. A link from
 * before the choice moved there (`?store=nur`) still opens on its brand; the parameter is then
 * dropped from the address, since the sidebar holds the choice now.
 */
export function BrandProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const linked = params.get('store');
  const [brand, setBrandState] = useState<Brand>(() => (linked === null ? stored() : parseBrand(linked)));
  // Taken while rendering, so the page never fetches once for the old brand first.
  if (linked !== null && parseBrand(linked) !== brand) setBrandState(parseBrand(linked));

  const setBrand = useCallback((next: Brand) => {
    setBrandState(next);
    store(next);
  }, []);

  useEffect(() => {
    if (linked === null) return;
    store(parseBrand(linked));
    setParams(
      (p) => {
        p.delete('store');
        return p;
      },
      { replace: true },
    );
  }, [linked, setParams]);

  const value = useMemo(() => ({ brand, setBrand }), [brand, setBrand]);
  return <BrandContext value={value}>{children}</BrandContext>;
}

export const useBrand = (): BrandValue => use(BrandContext);
