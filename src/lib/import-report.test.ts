import { describe, expect, it } from 'vitest';

import { parseCsv } from '@/lib/csv';
import { commitStance, reportLines, visibleLines } from '@/lib/import-report';

const CSV = ['date,sku,quantity,unit_price,tax', '2026-09-01,NBJ-SERUM-30,3,1450.00,0', '2026-09-02,BAD-SKU,1,990,0', '2026-09-03,NBJ-CREAM-50,2,"1,000.00",0'].join('\n');

describe('reading a sheet the way the backend does', () => {
  it('numbers rows by the line a person sees, header being line 1', () => {
    expect(parseCsv(CSV).map((r) => r.line)).toEqual([1, 2, 3, 4]);
  });

  it('counts a quoted line break as part of its row, not as a new one', () => {
    const rows = parseCsv('a,b\n"x\ny",2\nz,3');
    expect(rows.map((r) => [r.line, r.cells])).toEqual([[1, ['a', 'b']], [2, ['x\ny', '2']], [4, ['z', '3']]]);
  });

  it('handles CRLF, a byte-order mark and doubled quotes', () => {
    expect(parseCsv('﻿a,b\r\n"say ""hi""",2\r\n')).toEqual([{ line: 1, cells: ['a', 'b'] }, { line: 2, cells: ['say "hi"', '2'] }]);
  });

  it('refuses an unterminated quote', () => {
    expect(() => parseCsv('a,b\n"oops,2')).toThrow('Unterminated quote starting on line 2');
  });
});

describe('the dry-run report beside its cells', () => {
  const report = {
    rows: [
      { row: 2, ok: true, errors: [] },
      { row: 3, ok: false, errors: ['sku "BAD-SKU" is not one of our products'] },
      { row: 4, ok: true, errors: [] },
    ],
  };

  it('puts each line\'s own cells with its own errors', () => {
    const lines = reportLines(report, CSV);
    expect(lines.map((l) => l.cells?.sku)).toEqual(['NBJ-SERUM-30', 'BAD-SKU', 'NBJ-CREAM-50']);
    expect(lines[1]).toMatchObject({ ok: false, errors: ['sku "BAD-SKU" is not one of our products'] });
    expect(lines[2]?.cells?.unit_price).toBe('1,000.00');
  });

  it('shows only the problems on request', () => {
    expect(visibleLines(reportLines(report, CSV), 'problems').map((l) => l.row)).toEqual([3]);
    expect(visibleLines(reportLines(report, CSV), 'all')).toHaveLength(3);
  });

  it('still lists every line when the sheet cannot be read here', () => {
    const lines = reportLines(report, 'a,b\n"oops');
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.cells === null)).toBe(true);
  });

  it('handles 200 rows, in order, with every error on its own line', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ row: i + 2, ok: i % 7 !== 0, errors: i % 7 === 0 ? [`problem ${i}`] : [] }));
    const csv = ['date,sku,quantity,unit_price,tax', ...rows.map((r) => `2026-09-01,SKU-${r.row},1,10,0`)].join('\n');
    const lines = reportLines({ rows }, csv);
    expect(lines).toHaveLength(200);
    expect(lines.every((l) => l.cells?.sku === `SKU-${l.row}`)).toBe(true);
    expect(visibleLines(lines, 'problems')).toHaveLength(29);
  });
});

describe('what the commit may do', () => {
  const base = { fileErrors: [], valid: 3, invalid: 0, alreadyImported: null };
  it('is blocked by a file error, empty with nothing valid, partial with some invalid, whole otherwise', () => {
    expect(commitStance({ ...base, fileErrors: ['Missing column: sku'] })).toBe('blocked');
    expect(commitStance({ ...base, valid: 0, invalid: 4 })).toBe('nothing');
    expect(commitStance({ ...base, invalid: 2 })).toBe('partial');
    expect(commitStance(base)).toBe('all');
  });
});
