import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { type StoreKey, type VariantHit, apiGet } from '@/lib/api';

/** Find a product by SKU or name and pick it. Waits for typing to pause; short searches show nothing. */
export function VariantPicker({ onPick, store, placeholder = 'Find a product by SKU or name' }: { onPick: (hit: VariantHit) => void; store?: StoreKey; placeholder?: string }) {
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<VariantHit[]>([]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiGet<{ variants: VariantHit[] }>(`/api/v1/stock/variants?search=${encodeURIComponent(term)}${store ? `&store=${store}` : ''}`, controller.signal)
        .then((r) => setHits(r.variants))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, store]);

  const visible = search.trim().length >= 2 ? hits : [];
  return (
    <div className="relative">
      <Input aria-label={placeholder} placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} />
      {visible.length > 0 && (
        <div role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-background shadow">
          {visible.map((hit) => (
            <button
              key={hit.id}
              type="button"
              role="option"
              aria-selected={false}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => {
                onPick(hit);
                setSearch('');
                setHits([]);
              }}
            >
              <span className="truncate">
                {hit.product} · {hit.variant}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{hit.sku ?? 'no SKU'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
