import { describe, expect, it } from 'vitest';

import type { JournalLine, Period, PnlRow } from '@/lib/api';
import { closeBlocker, closedInRange, closedMonths, isClosedDate, linesCsv, linesQuery, monthLabel, monthsBetween, netByMonth, pivotPnl, reportRanges, sourceLabel } from '@/lib/ledger';

const period = (year: number, month: number, status: 'open' | 'closed', entries = 5): Period => ({
  year,
  month,
  status,
  closedAt: status === 'closed' ? '2026-09-06T05:00:00Z' : null,
  closedBy: null,
  entries,
  closableFrom: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-05`,
});

describe('closed months', () => {
  const periods = [period(2026, 9, 'open'), period(2026, 8, 'closed'), period(2026, 7, 'closed')];
  const closed = closedMonths(periods);

  it('knows which months are closed and whether a date falls in one', () => {
    expect([...closed].sort()).toEqual(['2026-07', '2026-08']);
    expect(isClosedDate('2026-08-31', closed)).toBe(true);
    expect(isClosedDate('2026-09-01', closed)).toBe(false);
  });

  it('lists the closed months a range touches, including an open-ended one', () => {
    expect(closedInRange('2026-08-15', '2026-09-30', closed)).toEqual(['2026-08']);
    expect(closedInRange('2026-09-01', '2026-09-30', closed)).toEqual([]);
    expect(closedInRange(null, null, closed)).toEqual(['2026-07', '2026-08']);
    expect(closedInRange('2026-08-01', null, closed)).toEqual(['2026-08']);
  });

  it('counts the months of a range, across a year end', () => {
    expect(monthsBetween('2026-11-20', '2027-02-03')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthsBetween('2026-09-01', '2026-09-30')).toEqual(['2026-09']);
    expect(monthLabel('2026-09')).toBe('Sep 2026');
  });
});

describe('the close guard rails, in words', () => {
  const periods = [period(2026, 9, 'open'), period(2026, 8, 'open'), period(2026, 7, 'closed')];
  it('says a month is not yet closable, from when', () => {
    expect(closeBlocker(periods[1]!, periods, '2026-09-04')).toBe('Can be closed from 2026-09-05');
  });

  it('makes months close in order', () => {
    expect(closeBlocker(periods[0]!, periods, '2026-10-06')).toBe('Close Aug 2026 first: months close in order');
  });

  it('lets the oldest open month close once its day has come', () => {
    expect(closeBlocker(periods[1]!, periods, '2026-09-05')).toBeNull();
  });

  it('does not count an earlier month with no entries as blocking', () => {
    const quiet = [period(2026, 9, 'open'), period(2026, 8, 'open', 0)];
    expect(closeBlocker(quiet[0]!, quiet, '2026-10-06')).toBeNull();
  });

  it('refuses a closed month', () => {
    expect(closeBlocker(periods[2]!, periods, '2026-12-01')).toBe('Already closed');
  });
});

describe('ranges', () => {
  it('gives this month, last month (across a year start), this quarter and this year', () => {
    expect(reportRanges('2026-09-17')).toEqual([
      { label: 'This month', from: '2026-09-01', to: '2026-09-17' },
      { label: 'Last month', from: '2026-08-01', to: '2026-08-31' },
      { label: 'This quarter', from: '2026-07-01', to: '2026-09-17' },
      { label: 'This year', from: '2026-01-01', to: '2026-09-17' },
    ]);
    expect(reportRanges('2027-01-10')[1]).toEqual({ label: 'Last month', from: '2026-12-01', to: '2026-12-31' });
    expect(reportRanges('2028-03-05')[1]).toEqual({ label: 'Last month', from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('the drill-through address', () => {
  it('carries what the figure is and the report\'s own period and brand', () => {
    const q = new URLSearchParams(linesQuery({ account: '1100', month: '2026-09' }, { from: '2026-09-01', to: '2026-09-30', store: 'nur' }, { page: 2, size: 50 }));
    expect(Object.fromEntries(q)).toEqual({ account: '1100', month: '2026-09', from: '2026-09-01', to: '2026-09-30', store: 'nur', page: '2', size: '50' });
  });

  it('leaves out what is not set', () => {
    expect(linesQuery({ originType: 'vendor_bill', originId: '12' }, { from: null, store: '' })).toBe('originType=vendor_bill&originId=12');
  });
});

describe('P&L by month', () => {
  const rows: PnlRow[] = [
    { month: '2026-08', code: '4000', name: 'Sales', type: 'income', amount: '1000000' },
    { month: '2026-09', code: '4000', name: 'Sales', type: 'income', amount: '2500050' },
    { month: '2026-08', code: '5000', name: 'Cost of goods', type: 'expense', amount: '400000' },
    { month: '2026-09', code: '5100', name: 'PostEx charges', type: 'expense', amount: '90000' },
  ];

  it('lays accounts out by month with exact totals, income first', () => {
    const grid = pivotPnl(rows);
    expect(grid.months).toEqual(['2026-08', '2026-09']);
    expect(grid.accounts.map((a) => [a.code, a.total])).toEqual([['4000', '3500050'], ['5000', '400000'], ['5100', '90000']]);
    expect(grid.accounts[0]!.byMonth).toEqual({ '2026-08': '1000000', '2026-09': '2500050' });
  });

  it('nets income less expenses per month without floats', () => {
    expect(netByMonth(pivotPnl(rows))).toEqual({ '2026-08': '600000', '2026-09': '2410050' });
  });

  it('survives a bad amount and an empty report', () => {
    expect(pivotPnl([{ month: '2026-08', code: '4000', name: 'S', type: 'income', amount: 'x' }]).accounts).toEqual([]);
    expect(pivotPnl([])).toEqual({ months: [], accounts: [] });
  });
});

describe('CSV export of ledger lines', () => {
  const line = (over: Partial<JournalLine>): JournalLine => ({
    lineId: '1',
    entryId: '10',
    date: '2026-09-01',
    memo: 'Delivered: 2000, "quoted"',
    accountCode: '1100',
    accountName: 'COD receivable',
    debit: '275050',
    credit: '0',
    originType: 'shipment_sale',
    originId: '9',
    shipmentId: '9',
    isReversal: false,
    reversed: false,
    balance: '275050',
    ...over,
  });

  it('writes exact rupees a spreadsheet can sum, escaping commas and quotes, with a balance column for a ledger', () => {
    const csv = linesCsv([line({}), line({ lineId: '2', debit: '0', credit: '100', balance: '274950', isReversal: true })], true);
    const rows = csv.replace('﻿', '').trim().split('\r\n');
    expect(rows[0]).toBe('Date,Entry,Account,Account name,Memo,Source,Debit,Credit,Balance,Reversal,Reversed');
    expect(rows[1]).toBe('2026-09-01,10,1100,COD receivable,"Delivered: 2000, ""quoted""",Parcel delivered: sale,2750.50,,2750.50,,');
    expect(rows[2]).toContain(',,1.00,2749.50,yes,');
  });

  it('leaves the balance column out when the lines are not one account\'s ledger', () => {
    expect(linesCsv([line({ balance: null })], false)).not.toContain('Balance');
  });

  it('words a source it knows and one it does not', () => {
    expect(sourceLabel('vendor_bill')).toBe('Vendor bill');
    expect(sourceLabel('something_new')).toBe('something new');
  });
});
