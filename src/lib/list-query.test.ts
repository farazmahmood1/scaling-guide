import { describe, expect, it } from 'vitest';

import { toCsv } from '@/lib/csv';
import { type QuerySpec, applyChange, defaultQuery, nextSort, parseQuery, toParams } from '@/lib/list-query';

const spec: QuerySpec = {
  multi: { status: ['pending', 'confirmed', 'delivered'], store: ['nur', 'organics'] },
  sortKeys: ['placedAt', 'total'],
  defaultSort: { key: 'placedAt', dir: 'desc' },
  pageSizes: [25, 50, 100],
  defaultPageSize: 25,
  columnKeys: ['order', 'city', 'total'],
};

describe('list query in the URL', () => {
  it('round-trips every part of a filtered view', () => {
    const query = { ...defaultQuery(spec), search: 'Lahore', from: '2026-09-01', to: '2026-09-30', multi: { status: ['pending', 'confirmed'], store: ['nur'] }, page: 3, pageSize: 50, sort: { key: 'total', dir: 'asc' as const }, hidden: ['city'] };
    const params = toParams(query, spec);
    expect(params.toString()).toBe('q=Lahore&from=2026-09-01&to=2026-09-30&status=pending%2Cconfirmed&store=nur&page=3&size=50&sort=total%3Aasc&hide=city');
    expect(parseQuery(new URLSearchParams(params.toString()), spec)).toEqual(query);
  });

  it('a default view has an empty URL, and an empty URL is the default view', () => {
    expect(toParams(defaultQuery(spec), spec).toString()).toBe('');
    expect(parseQuery(new URLSearchParams(''), spec)).toEqual(defaultQuery(spec));
    // Turning the default sort off is a choice, so it stays in the URL.
    const unsorted = { ...defaultQuery(spec), sort: null };
    expect(parseQuery(toParams(unsorted, spec), spec).sort).toBeNull();
  });

  it('ignores what it does not understand rather than guessing', () => {
    const q = parseQuery(new URLSearchParams('from=2026-02-30&to=yesterday&status=pending,bogus,pending&page=-2&size=7&sort=evil:asc&hide=nope,city'), spec);
    expect([q.from, q.to, q.multi, q.page, q.pageSize, q.sort, q.hidden]).toEqual([null, null, { status: ['pending'] }, 1, 25, spec.defaultSort, ['city']]);
    expect(parseQuery(new URLSearchParams('from=2026-09-30&to=2026-09-01'), spec)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('a filter change goes back to page 1; paging and hiding a column do not', () => {
    const on3 = { ...defaultQuery(spec), page: 3 };
    expect(applyChange(on3, { search: 'x' }).page).toBe(1);
    expect(applyChange(on3, { hidden: ['city'] }).page).toBe(3);
    expect(applyChange(on3, { page: 4 }).page).toBe(4);
  });

  it('a header click sorts ascending, then descending, then back to the default', () => {
    const fallback = spec.defaultSort;
    expect(nextSort(fallback, 'total', fallback)).toEqual({ key: 'total', dir: 'asc' });
    expect(nextSort({ key: 'total', dir: 'asc' }, 'total', fallback)).toEqual({ key: 'total', dir: 'desc' });
    expect(nextSort({ key: 'total', dir: 'desc' }, 'total', fallback)).toEqual(fallback);
    expect(nextSort({ key: 'placedAt', dir: 'desc' }, 'placedAt', fallback)).toBeNull();
  });
});

describe('CSV export', () => {
  it('quotes where needed, defuses formulas, keeps numbers, and marks the file UTF-8', () => {
    const csv = toCsv(['Order', 'Note', 'Total'], [['#1', 'says "hi", ok', '-250.00'], ['#2', '=HYPERLINK("x")', '2,500']]);
    expect(csv).toBe('﻿Order,Note,Total\r\n#1,"says ""hi"", ok",-250.00\r\n#2,"\'=HYPERLINK(""x"")","2,500"\r\n');
  });
});
