import { CircleAlert, CircleCheck } from 'lucide-react';

import type { SheetReport } from '@/lib/api';
import { formatKarachiFull, formatPaisa } from '@/lib/format';
import { type LineFilter, type ReportLine, SHEET_COLUMNS, visibleLines } from '@/lib/import-report';
import { cn } from '@/lib/utils';

const HEADINGS: Record<(typeof SHEET_COLUMNS)[number], string> = { date: 'Date', sku: 'SKU', quantity: 'Qty', unit_price: 'Unit price', tax: 'Tax' };

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-lg font-semibold tabular-nums', tone === 'bad' && 'text-brand-coral', tone === 'good' && 'text-primary')}>{value}</dd>
    </div>
  );
}

/**
 * What a dry run found, laid out to be read at 200 rows: the totals first, then the sheet itself
 * line by line with each line's problems in the same row, and a switch to show only the problem
 * lines. A problem line is marked by an icon and the words "Problem", never by colour alone. The
 * header stays in view while the lines scroll.
 */
export function ImportReport({ report, lines, filter, onFilter }: { report: SheetReport; lines: readonly ReportLine[]; filter: LineFilter; onFilter: (filter: LineFilter) => void }) {
  const shown = visibleLines(lines, filter);
  return (
    <div className="space-y-3" data-testid="import-report">
      {report.alreadyImported && (
        <p role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          This exact file was already imported (version {report.alreadyImported.version}, {formatKarachiFull(report.alreadyImported.importedAt)}). Reverse that import first, or import this one as a new version on purpose.
        </p>
      )}
      {report.fileErrors.length > 0 && (
        <div role="alert" className="rounded-lg border border-brand-coral/50 bg-brand-coral/5 p-3 text-sm">
          <p className="font-medium">The file cannot be imported</p>
          <ul className="mt-1 list-disc pl-5">
            {report.fileErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="Valid rows" value={String(report.valid)} tone={report.valid > 0 ? 'good' : undefined} />
        <Figure label="Rows with problems" value={String(report.invalid)} tone={report.invalid > 0 ? 'bad' : undefined} />
        <Figure label="Units sold" value={String(report.units)} />
        <Figure label="Net sales" value={formatPaisa(report.net)} />
        <Figure label="Tax" value={formatPaisa(report.tax)} />
        <Figure label="Cost of goods" value={formatPaisa(report.cost)} />
      </dl>

      {lines.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground" aria-live="polite">
              Showing {shown.length} of {lines.length} rows
            </p>
            <div role="group" aria-label="Which rows" className="flex gap-1">
              {(['all', 'problems'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  disabled={f === 'problems' && report.invalid === 0}
                  onClick={() => onFilter(f)}
                  className="rounded-md px-3 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40 aria-pressed:bg-secondary aria-pressed:font-medium"
                >
                  {f === 'all' ? 'All rows' : `Only problems (${report.invalid})`}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Rows of the sales sheet and what is wrong with each</caption>
              <thead className="sticky top-0 z-10 bg-muted text-left">
                <tr>
                  <th scope="col" className="w-14 px-3 py-2 font-medium">
                    Line
                  </th>
                  <th scope="col" className="w-24 px-3 py-2 font-medium">
                    Result
                  </th>
                  {SHEET_COLUMNS.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                      {HEADINGS[c]}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 font-medium">
                    What is wrong
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.row} className={cn('border-t align-top', !l.ok && 'border-l-4 border-l-brand-coral bg-brand-coral/5')} data-ok={l.ok}>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground tabular-nums">{l.row}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {l.ok ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <CircleCheck className="size-3.5" />
                          OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-brand-coral">
                          <CircleAlert className="size-3.5" />
                          Problem
                        </span>
                      )}
                    </td>
                    {SHEET_COLUMNS.map((c) => (
                      <td key={c} className={cn('px-3 py-1.5 whitespace-nowrap', c === 'quantity' || c === 'unit_price' || c === 'tax' ? 'tabular-nums' : '', c === 'sku' && 'font-mono text-xs')}>
                        {l.cells ? l.cells[c] || <span className="text-muted-foreground">—</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-1.5">
                      {l.errors.length > 0 && (
                        <ul className="space-y-0.5 text-brand-coral">
                          {l.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
