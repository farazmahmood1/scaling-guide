import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Info, Table2 } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * What a figure means, one tap or hover away. A button, so it works from the keyboard and on a
 * phone, where there is no hover: tap opens it, tapping elsewhere or Esc closes it. The text is
 * `role="tooltip"` and described-by the button, so a screen reader hears it with the figure.
 */
export function Definition({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
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
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute top-full left-0 z-30 mt-1 w-72 max-w-[calc(100vw-3rem)] rounded-lg border bg-popover p-3 text-left text-xs leading-relaxed font-normal text-popover-foreground shadow-lg"
        >
          {children}
        </span>
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
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 px-4 pb-0">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <Definition term={label}>{definition}</Definition>
      </CardHeader>
      <CardContent className="space-y-1 px-4">
        {loading ? (
          <Skeleton className="h-9 w-32" />
        ) : error ? (
          <p role="alert" className="text-sm text-brand-coral">
            Could not load
          </p>
        ) : (
          <p className="text-3xl font-semibold tracking-tight text-brand-navy dark:text-foreground">{value ?? '—'}</p>
        )}
        {basis && !loading && !error && <p className="text-sm text-muted-foreground">{basis}</p>}
        <p className="text-xs text-muted-foreground">{period}</p>
        <Link className="inline-flex items-center gap-1 pt-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" to={href}>
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
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0 px-4 pb-0">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-semibold">{title}</h3>
            <Definition term={title}>{definition}</Definition>
          </div>
          <p className="text-xs text-muted-foreground">{period}</p>
        </div>
        <Button variant={asTable ? 'secondary' : 'ghost'} size="sm" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          <Table2 className="size-4" aria-hidden />
          {asTable ? 'Show the chart' : 'Show as a table'}
        </Button>
      </CardHeader>
      <CardContent className="px-4">
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
          <div role="img" aria-label={`${title}. ${summary}`}>
            {children}
          </div>
        )}
      </CardContent>
    </Card>
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
