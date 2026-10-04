import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Info, Table2 } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type FunnelPoint, shareText } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

const TIP_WIDTH = 288;
const TIP_GAP = 4;
const EDGE = 8;

/**
 * What a figure means, one tap or hover away. A button, so it works from the keyboard and on a
 * phone, where there is no hover: tap opens it, tapping elsewhere or Esc closes it. The text is
 * `role="tooltip"` and described-by the button, so a screen reader hears it with the figure.
 *
 * The text is drawn on the page itself, not inside the card: a card clips what overhangs it, and a
 * definition beside the card's edge would be cut off. It is placed under the button, slid sideways
 * to stay on screen, and put above the button when there is no room below.
 */
export function Definition({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);

  // Set on the element, not in state: it follows the page as it scrolls without rendering again.
  const place = useCallback(() => {
    const from = button.current;
    const el = tip.current;
    if (!from || !el) return;
    const at = from.getBoundingClientRect();
    const width = Math.min(TIP_WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(at.left, EDGE), window.innerWidth - width - EDGE);
    const below = at.bottom + TIP_GAP;
    const fitsBelow = below + el.offsetHeight <= window.innerHeight - EDGE;
    const above = at.top - TIP_GAP - el.offsetHeight;
    el.style.width = `${width}px`;
    el.style.left = `${left}px`;
    el.style.top = `${fitsBelow || above < EDGE ? below : above}px`;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !tip.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={button}
        type="button"
        aria-label={`What ${term} means`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open &&
        createPortal(
          <span
            ref={tip}
            role="tooltip"
            id={id}
            style={{ position: 'fixed', top: 0, left: 0, width: TIP_WIDTH }}
            className="pointer-events-none z-50 block rounded-lg border bg-popover p-3 text-left text-xs leading-relaxed font-normal text-popover-foreground shadow-lg"
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}

/**
 * One headline figure: its name, its value, what the value is made of, the period it covers, what
 * it means (on hover or tap) and a link to the report behind it. Nothing is shown as a number
 * without all of these. While loading it holds its place; with nothing to show it says so.
 */
export function StatTile({
  label,
  value,
  basis,
  period,
  definition,
  href,
  loading,
  error,
}: {
  label: string;
  value?: string;
  basis?: ReactNode;
  period: string;
  definition: ReactNode;
  href: string;
  loading?: boolean;
  error?: string;
}) {
  return (
    <Card data-testid="stat-tile" className="gap-3 py-4">
      <CardHeader className="flex items-center gap-1 space-y-0 px-4 pb-0">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <Definition term={label}>{definition}</Definition>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto px-4">
        {loading ? (
          // The figure and the line under it, at their sizes, so the tile is its final height from the start.
          <div role="status" aria-label={`Loading ${label}`}>
            <Skeleton className="h-9 w-40" />
            <Skeleton className="mt-1.5 mb-0.5 h-4 w-48 max-w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-brand-coral">
            Could not load
          </p>
        ) : (
          <p className="loaded-in text-3xl font-semibold tracking-tight text-brand-navy dark:text-foreground">{value ?? '—'}</p>
        )}
        {basis && !loading && !error && <p className="loaded-in text-sm text-muted-foreground">{basis}</p>}
        <p className="text-xs text-muted-foreground">{period}</p>
        <Link className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" to={href}>
          Open the report
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

export interface ChartTable {
  caption: string;
  columns: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<ReactNode>>;
}

/**
 * A chart in its card: the title, what it measures and the period it covers up top, the plot, and
 * a switch to the same numbers as a table, which is also how a screen reader or a printout reads
 * it. The plot is described for assistive tech; the table carries the exact figures.
 */
export function ChartCard({
  title,
  period,
  definition,
  summary,
  table,
  className,
  children,
}: {
  title: string;
  period: string;
  definition: ReactNode;
  /** One sentence of what the plot shows, for assistive technology. */
  summary: string;
  table: ChartTable;
  className?: string;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cn('gap-3 py-4', className)}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 space-y-0 px-4 pb-0">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-semibold">{title}</h3>
            <Definition term={title}>{definition}</Definition>
          </div>
          <p className="text-xs text-muted-foreground">{period}</p>
        </div>
        <Button variant={asTable ? 'secondary' : 'ghost'} size="sm" className="shrink-0" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          <Table2 className="size-4" aria-hidden />
          {asTable ? 'Show the chart' : 'Show as a table'}
        </Button>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4">
        {asTable ? (
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">{table.caption}</caption>
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} scope="col" className={cn('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-t">
                    {row.map((cell, i) => (
                      <td key={i} className={cn('px-3 py-1.5', i > 0 && 'text-right tabular-nums')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div role="img" aria-label={`${title}. ${summary}`} className="flex h-full min-h-0 flex-col">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The order funnel: a bar for each step, drawn to the orders placed, with the count and the share
 * of placed orders that reached it. Plain bars rather than a chart library: the figures are
 * printed beside them, and returned is the one step that is a loss, so it takes the second colour.
 */
export function FunnelBars({ points }: { points: readonly FunnelPoint[] }) {
  const top = Math.max(1, ...points.map((p) => p.count));
  return (
    <ul>
      {points.map((p) => (
        <li key={p.key} className="flex h-[34px] items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">{p.label}</span>
          <span className="flex-1 border-l py-1.5">
            {/* A step reached by only a few orders still shows as a sliver, never as no bar. */}
            <span className="block h-5 rounded-r-sm" style={{ width: `${p.count === 0 ? 0 : Math.max(1, (p.count / top) * 100)}%`, backgroundColor: p.key === 'returned' ? 'var(--viz-2)' : 'var(--viz-1)' }} />
          </span>
          <span className="w-14 text-right font-semibold tabular-nums">{p.count.toLocaleString('en-PK')}</span>
          <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">{shareText(p.share)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A swatch and a name: the legend for a chart of two or more series. Identity is the swatch, never colored text. */
export function Legend({ items }: { items: ReadonlyArray<{ label: string; color: string }> }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: i.color, height: 3 }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
