import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Placeholders in the shape of what is loading: a table keeps its real headers and column
 * alignment, a list its rows, a form its fields, a chart its axes. Each is sized to the text it
 * stands for (a `text-sm` line is 20px, a `text-xs` line 16px), so the page does not move when the
 * data arrives. Widths vary by row from a fixed cycle: the same on every render, never random.
 */

/** Says "loading" once to assistive technology; the bars inside are decoration. */
export function Loading({ label = 'Loading', className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} data-testid="loading">
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  );
}

/** One line of `text-sm`. */
export function Line({ className }: { className?: string }) {
  return <Skeleton className={cn('my-0.5 h-4 max-w-full', className)} />;
}

/** One line of `text-xs`. */
export function SmallLine({ className }: { className?: string }) {
  return <Skeleton className={cn('my-0.5 h-3 max-w-full', className)} />;
}

const TEXT_WIDTHS = ['w-32', 'w-24', 'w-40', 'w-28', 'w-36'] as const;
const NUMBER_WIDTHS = ['w-16', 'w-12', 'w-20', 'w-14'] as const;
const pick = <T,>(from: readonly T[], i: number): T => from[i % from.length]!;

// ---- Tables ----

export interface SkeletonColumn {
  /** The real header, shown as it will be. Empty for an actions column. */
  header?: string;
  align?: 'right' | 'center';
  /** A smaller second line under the first, for a cell that carries one. */
  sub?: boolean;
  /** What the cell holds, when it is not plain text. */
  as?: 'badge' | 'button' | 'control';
}

/** A column that is a right-aligned number. */
export const num = (header: string): SkeletonColumn => ({ header, align: 'right' });

const TABLE = {
  // The list tables: a bordered box with a tinted header.
  bordered: { wrap: 'overflow-x-auto rounded-lg border', thead: 'bg-muted/40 text-left text-muted-foreground', th: 'px-3 py-2 font-medium', td: 'px-3 py-2', tr: 'border-t' },
  // A table inside a panel, with no box of its own.
  plain: { wrap: 'overflow-x-auto', thead: 'text-left text-muted-foreground', th: 'py-1.5 pr-3 font-medium', td: 'py-2 pr-3', tr: 'border-t' },
  // The shadcn `Table`.
  ui: { wrap: 'overflow-x-auto', thead: '[&_tr]:border-b', th: 'h-10 px-2 text-left align-middle font-medium whitespace-nowrap', td: 'p-2 align-middle', tr: 'border-b last:border-0' },
} as const;

function CellBar({ column, row, index }: { column: SkeletonColumn; row: number; index: number }) {
  const side = column.align === 'right' ? 'ml-auto' : column.align === 'center' ? 'mx-auto' : '';
  if (column.as === 'badge') return <Skeleton className={cn('h-5 w-16 rounded-full', side)} />;
  if (column.as === 'button') return <Skeleton className={cn('h-7 w-16', side)} />;
  if (column.as === 'control') return <Skeleton className={cn('h-7 w-32', side)} />;
  const width = column.align ? pick(NUMBER_WIDTHS, row + index) : pick(TEXT_WIDTHS, row + index * 2);
  return (
    <>
      <Line className={cn(width, side)} />
      {column.sub && <SmallLine className={cn(pick(TEXT_WIDTHS, row + index + 1), side)} />}
    </>
  );
}

/** A table's rows while they load, under the table's own headers. */
export function TableSkeleton({
  columns,
  rows = 5,
  variant = 'bordered',
  footer = false,
  label,
  className,
}: {
  columns: ReadonlyArray<string | SkeletonColumn>;
  rows?: number;
  variant?: keyof typeof TABLE;
  /** A totals row at the foot. */
  footer?: boolean;
  label?: string;
  className?: string;
}) {
  const cols = columns.map((c): SkeletonColumn => (typeof c === 'string' ? { header: c } : c));
  const s = TABLE[variant];
  const headed = cols.some((c) => c.header);
  return (
    <Loading label={label} className={cn(s.wrap, className)}>
      <table className="w-full text-sm">
        {headed && (
          <thead className={s.thead}>
            <tr>
              {cols.map((c, i) => (
                <th key={i} scope="col" className={cn(s.th, c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className={cn(s.tr, !headed && 'first:border-t-0')}>
              {cols.map((c, i) => (
                <td key={i} className={s.td}>
                  <CellBar column={c} row={r} index={i} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t-2 bg-muted/30">
            <tr>
              {cols.map((c, i) => (
                <td key={i} className={s.td}>
                  {(i === 0 || c.align === 'right') && <Line className={cn(i === 0 ? 'w-20' : pick(NUMBER_WIDTHS, i), c.align === 'right' && 'ml-auto')} />}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </Loading>
  );
}

// ---- Lists ----

/** Rows of a divided list: a line (and a smaller one) on the left, what the row ends in on the right. */
export function ListSkeleton({
  rows = 4,
  lines = 2,
  icon = false,
  trailing = 'none',
  rowClassName = 'py-3',
  label,
  className,
}: {
  rows?: number;
  lines?: 1 | 2 | 3;
  /** A leading icon. */
  icon?: boolean;
  trailing?: 'none' | 'badge' | 'button' | 'number' | 'badge-button';
  rowClassName?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Loading label={label} className={className}>
      <ul className="divide-y">
        {Array.from({ length: rows }, (_, r) => (
          <li key={r} className={cn('flex items-center justify-between gap-3', rowClassName)}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {icon && <Skeleton className="size-4 shrink-0 rounded-full" />}
              <div className="min-w-0 flex-1">
                <Line className={pick(['w-56', 'w-44', 'w-64', 'w-48'], r)} />
                {lines >= 2 && <SmallLine className={pick(['w-72', 'w-60', 'w-52', 'w-64'], r)} />}
                {lines >= 3 && <SmallLine className={pick(['w-40', 'w-48', 'w-36'], r)} />}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {(trailing === 'badge' || trailing === 'badge-button') && <Skeleton className="h-5 w-16 rounded-full" />}
              {(trailing === 'button' || trailing === 'badge-button') && <Skeleton className="h-8 w-16" />}
              {trailing === 'number' && <Line className={pick(['w-8', 'w-6', 'w-10'], r)} />}
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

/** Label on the left, value on the right: a definition list, or the lines of a small statement. */
export function FactsSkeleton({ rows = 5, rowClassName = 'py-1.5', divided = true, className }: { rows?: number; rowClassName?: string; divided?: boolean; className?: string }) {
  return (
    <div className={cn(divided && 'divide-y', className)}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={cn('flex items-center justify-between gap-4', rowClassName)}>
          <Line className={pick(['w-20', 'w-28', 'w-16', 'w-24'], r)} />
          <Line className={pick(['w-28', 'w-20', 'w-36', 'w-24'], r)} />
        </div>
      ))}
    </div>
  );
}

// ---- Forms ----

/** A settings form: its fields (label, input, hint) in their grid, then the save bar. */
export function FormSkeleton({ fields = 3, columns = 3, multiline = false, label = 'Loading the setting' }: { fields?: number; columns?: 2 | 3; multiline?: boolean; label?: string }) {
  return (
    <Loading label={label} className="space-y-4">
      <div className={cn('grid gap-4', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {Array.from({ length: fields }, (_, f) => (
          <div key={f} className="space-y-1">
            <Line className={pick(['w-44', 'w-52', 'w-36'], f)} />
            <Skeleton className={cn('w-full rounded-lg', multiline ? 'h-[74px]' : 'h-9')} />
            <SmallLine className={pick(['w-56', 'w-48', 'w-60'], f)} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t pt-3">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-24" />
      </div>
    </Loading>
  );
}

// ---- Charts ----

const COLUMN_HEIGHTS = ['62%', '38%', '80%', '54%', '70%', '46%', '88%', '58%'] as const;
const BAR_WIDTHS = ['92%', '78%', '66%', '58%', '47%', '40%', '31%', '24%'] as const;
// A gently rising line as a thin band: the top edge left to right, then the bottom edge back.
const LINE_BAND = 'polygon(0% 70%, 20% 52%, 40% 60%, 60% 34%, 80% 42%, 100% 18%, 100% 21%, 80% 45%, 60% 37%, 40% 63%, 20% 55%, 0% 73%)';
const LINE_BAND_2 = 'polygon(0% 84%, 20% 76%, 40% 80%, 60% 64%, 80% 70%, 100% 56%, 100% 59%, 80% 73%, 60% 67%, 40% 83%, 20% 79%, 0% 87%)';

/**
 * A chart while its numbers load: the axes and gridlines where they will be, and marks of the
 * chart's own kind (lines, columns, or ranked bars). `height` is the plot's, as given to the chart.
 */
export function ChartSkeleton({ kind, height = 240, series = 1, count = 6, legend = false }: { kind: 'line' | 'columns' | 'bars'; height?: number; series?: 1 | 2; count?: number; legend?: boolean }) {
  if (kind === 'bars') {
    return (
      <Loading label="Loading the chart">
        <div style={{ height }} className="flex flex-col justify-start pt-1">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex h-[34px] items-center gap-2">
              <div className="flex w-[104px] shrink-0 justify-end">
                <SmallLine className={pick(['w-20', 'w-16', 'w-24', 'w-14'], i)} />
              </div>
              <div className="flex-1 border-l py-1.5">
                <Skeleton className="h-5 rounded-l-none" style={{ width: pick(BAR_WIDTHS, i) }} />
              </div>
            </div>
          ))}
        </div>
      </Loading>
    );
  }
  return (
    <Loading label="Loading the chart">
      {legend && (
        <div className="mb-2 flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      )}
      <div style={{ height }} className="flex gap-2">
        <div className="flex w-10 shrink-0 flex-col items-end justify-between pb-[30px]">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-7" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1 border-b">
            <div className="absolute inset-0 flex flex-col justify-between">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="border-t" />
              ))}
              <div />
            </div>
            {kind === 'line' ? (
              <>
                <Skeleton className="absolute inset-0 rounded-none" style={{ clipPath: LINE_BAND }} />
                {series === 2 && <Skeleton className="absolute inset-0 rounded-none" style={{ clipPath: LINE_BAND_2 }} />}
              </>
            ) : (
              <div className="absolute inset-0 flex items-end justify-around px-2">
                {Array.from({ length: count }, (_, i) => (
                  <Skeleton key={i} className="w-6 rounded-b-none" style={{ height: pick(COLUMN_HEIGHTS, i) }} />
                ))}
              </div>
            )}
          </div>
          <div className="flex h-[30px] items-center justify-around">
            {Array.from({ length: count }, (_, i) => (
              <Skeleton key={i} className="h-3 w-10" />
            ))}
          </div>
        </div>
      </div>
    </Loading>
  );
}

// ---- The app frame ----

/** The whole frame before the first page's code has arrived: the sidebar, the top bar, and a page taking shape. */
export function AppSkeleton() {
  return (
    <Loading label="Loading" className="min-h-screen bg-background">
      <div className="min-h-screen lg:flex">
        <div className="hidden w-60 shrink-0 bg-brand-navy p-4 lg:block">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-white/15" />
            <div className="h-4 w-28 rounded bg-white/15" />
          </div>
          <div className="mt-8 space-y-6">
            {[4, 5, 3].map((links, group) => (
              <div key={group} className="space-y-3">
                <div className="h-3 w-16 rounded bg-white/10" />
                {Array.from({ length: links }, (_, i) => (
                  <div key={i} className="h-4 rounded bg-white/15" style={{ width: pick(['60%', '75%', '50%', '68%', '56%'], i + group) }} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b bg-brand-navy px-4 sm:px-6 lg:bg-background">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <Skeleton className="h-8 w-48" />
            <SmallLine className="mt-2 h-4 w-96" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-3 rounded-xl border p-4">
                  <Line className="w-28" />
                  <Skeleton className="h-9 w-36" />
                  <Line className="w-44" />
                  <SmallLine className="w-28" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Loading>
  );
}
