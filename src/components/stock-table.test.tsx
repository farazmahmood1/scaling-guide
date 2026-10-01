import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StockTable, StockTotals } from '@/components/stock-table';
import type { Quant } from '@/lib/api';
import { pivotQuants } from '@/lib/stock';

const quant = (variant: string, kind: string, qty: number): Quant => ({
  variant_id: variant,
  store: 'nur',
  sku: `SKU-${variant}`,
  product: `Product ${variant}`,
  variant: 'Default',
  location_id: kind,
  location: kind,
  location_kind: kind,
  qty,
});

const rows = pivotQuants([quant('1', 'warehouse', 40), quant('1', 'in_transit', 12), quant('1', 'returning', 3), quant('2', 'warehouse', -2)]);
const table = renderToStaticMarkup(<StockTable rows={rows} selected={null} onSelect={() => {}} />);
const totals = renderToStaticMarkup(<StockTotals rows={rows} />);

/** The class attribute of the header cell (`th`) or total label (`dt`) that contains `label`. */
const classOf = (html: string, label: string): string => new RegExp(`<(?:th|dt)[^>]*class="([^"]*)"[^>]*>(?:(?!</(?:th|dt)>).)*?${label}`, 's').exec(html)?.[1] ?? '';

describe('stock by place', () => {
  it('names every place in words, shelf first', () => {
    const heads = [...table.matchAll(/<th scope="col"[^>]*>(?:<span[^>]*>)?(?:<svg[^>]*>.*?<\/svg>)?([^<]+)</gs)].map((m) => m[1]);
    expect(heads).toEqual(['Product', 'On the shelf', 'With PostEx', 'Coming back', 'At partners', 'Damaged']);
  });

  it('makes "With PostEx" and "Coming back" look different from the shelf and from each other', () => {
    const shelf = classOf(table, 'On the shelf');
    const postex = classOf(table, 'With PostEx');
    const back = classOf(table, 'Coming back');
    expect(new Set([shelf, postex, back]).size).toBe(3);
    expect(postex).toContain('sky');
    expect(back).toContain('amber');
    expect(shelf).not.toMatch(/sky|amber/);
  });

  it('tints the cell that holds units, in its own place\'s colour, and leaves empty cells quiet', () => {
    // Product 1 has units with PostEx and coming back: those cells carry the tints; the shelf cell none.
    expect(table).toContain('bg-sky-500/10');
    expect(table).toContain('bg-amber-500/15');
    expect(table).toContain('text-muted-foreground/50');
  });

  it('flags negative stock with an icon and a label, not only a colour', () => {
    expect(table).toContain('aria-label="negative stock"');
  });

  it('shows the totals in the same looks, so the summary matches the columns', () => {
    expect(totals).toContain('With PostEx');
    expect(totals).toContain('Coming back');
    expect(totals).toContain('border-l-4');
    expect(classOf(totals, 'With PostEx')).toContain('sky');
  });

  it('opens a product\'s move history from its name', () => {
    expect(table).toContain('aria-label="Move history of Product 1 Default"');
  });
});
