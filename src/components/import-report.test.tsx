import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ImportReport } from '@/components/import-report';
import type { SheetReport } from '@/lib/api';
import { reportLines } from '@/lib/import-report';

const report = (over: Partial<SheetReport> = {}): SheetReport => ({
  fileSha256: 'x',
  fileErrors: [],
  rows: [],
  valid: 0,
  invalid: 0,
  units: 0,
  net: '0',
  tax: '0',
  cost: '0',
  alreadyImported: null,
  ...over,
});

const sheet = (n: number, bad: (i: number) => string | null) => {
  const csv = ['date,sku,quantity,unit_price,tax', ...Array.from({ length: n }, (_, i) => `2026-09-01,SKU-${i + 2},1,10.00,0`)].join('\n');
  const rows = Array.from({ length: n }, (_, i) => {
    const e = bad(i);
    return { row: i + 2, ok: e === null, errors: e ? [e] : [] };
  });
  return { csv, rows, valid: rows.filter((r) => r.ok).length, invalid: rows.filter((r) => !r.ok).length };
};

const html = (r: SheetReport, csv: string, filter: 'all' | 'problems' = 'all') =>
  renderToStaticMarkup(<ImportReport report={r} lines={reportLines(r, csv)} filter={filter} onFilter={() => {}} />);

describe('the import dry-run report at 200 rows', () => {
  const s = sheet(200, (i) => (i % 10 === 3 ? `sku "SKU-${i + 2}" is not one of our products` : null));
  const r = report({ rows: s.rows, valid: s.valid, invalid: s.invalid, units: s.valid, net: '1800000' });

  it('shows all 200 rows with each error in its own row, beside the cells it is about', () => {
    const out = html(r, s.csv);
    expect((out.match(/<tr class="border-t align-top/g) ?? []).length).toBe(200);
    // Row 5 is invalid: its SKU and its error share one <tr>.
    const rowFive = /<tr[^>]*>(?:(?!<\/tr>).)*>5<\/td>(?:(?!<\/tr>).)*<\/tr>/s.exec(out)?.[0] ?? '';
    expect(rowFive).toContain('SKU-5');
    expect(rowFive).toContain('sku &quot;SKU-5&quot; is not one of our products');
    expect(rowFive).toContain('Problem');
  });

  it('marks problems with words and an icon, not only a colour, and sums the totals above', () => {
    const out = html(r, s.csv);
    expect((out.match(/data-ok="false"/g) ?? []).length).toBe(20);
    expect(out).toContain('Rows with problems');
    expect(out).toContain('Rs 18,000.00');
  });

  it('can show only the 20 problem rows', () => {
    const out = html(r, s.csv, 'problems');
    expect((out.match(/<tr class="border-t align-top/g) ?? []).length).toBe(20);
    expect(out).toContain('Showing 20 of 200 rows');
    expect(out).not.toContain('data-ok="true"');
  });

  it('keeps the header in view while the rows scroll', () => {
    expect(html(r, s.csv)).toContain('sticky top-0');
  });
});

describe('the report\'s warnings', () => {
  it('says why a file cannot be imported', () => {
    const out = html(report({ fileErrors: ['Missing column: sku. Use the template.'] }), '');
    expect(out).toContain('The file cannot be imported');
    expect(out).toContain('Missing column: sku');
  });

  it('says when this exact file was already imported', () => {
    const out = html(report({ alreadyImported: { importId: '4', version: 2, importedAt: '2026-09-20T06:00:00Z' } }), '');
    expect(out).toContain('already imported');
    expect(out).toContain('version 2');
  });
});
