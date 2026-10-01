import type { SheetReport } from '@/lib/api';
import { parseCsv } from '@/lib/csv';

/**
 * A dry-run report laid beside the cells it is about. The backend reports per line number; the
 * sheet is still in the browser, so each line's date, SKU, quantity, price and tax can sit in the
 * same row as the errors, and a person fixes the file without counting lines in a spreadsheet.
 */
export const SHEET_COLUMNS = ['date', 'sku', 'quantity', 'unit_price', 'tax'] as const;
export type SheetColumn = (typeof SHEET_COLUMNS)[number];

export interface ReportLine {
  row: number;
  ok: boolean;
  errors: string[];
  /** The line's cells by column; null when the file could not be read here. */
  cells: Record<SheetColumn, string> | null;
}

export const reportLines = (report: Pick<SheetReport, 'rows'>, csv: string): ReportLine[] => {
  const byLine = new Map<number, Record<SheetColumn, string>>();
  try {
    const [header, ...body] = parseCsv(csv);
    const columns = (header?.cells ?? []).map((c) => c.trim().toLowerCase());
    for (const { line, cells } of body) {
      const at = (column: SheetColumn) => (cells[columns.indexOf(column)] ?? '').trim();
      byLine.set(line, { date: at('date'), sku: at('sku'), quantity: at('quantity'), unit_price: at('unit_price'), tax: at('tax') });
    }
  } catch {
    // An unreadable file has no cells to show; the report's own file error says why.
  }
  return report.rows.map((r) => ({ row: r.row, ok: r.ok, errors: r.errors, cells: byLine.get(r.row) ?? null }));
};

/** The published template, as the backend serves it; offered as a download without a round trip. */
export const TEMPLATE_CSV =
  'date,sku,quantity,unit_price,tax\n' + '2026-09-01,NBJ-SERUM-30,3,1450.00,0\n' + '2026-09-02,NBJ-CREAM-50,1,990,0\n';

export type LineFilter = 'all' | 'problems';

export const visibleLines = (lines: readonly ReportLine[], filter: LineFilter): ReportLine[] => (filter === 'problems' ? lines.filter((l) => !l.ok) : [...lines]);

/** What the commit button may say: nothing to import, only the valid rows, or everything. */
export const commitStance = (report: Pick<SheetReport, 'fileErrors' | 'valid' | 'invalid' | 'alreadyImported'>): 'blocked' | 'nothing' | 'partial' | 'all' => {
  if (report.fileErrors.length > 0) return 'blocked';
  if (report.valid === 0) return 'nothing';
  return report.invalid > 0 ? 'partial' : 'all';
};
