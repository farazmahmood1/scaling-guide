import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ClosedBanner } from '@/components/closed-period';
import { LinesTable } from '@/components/journal-lines';
import type { JournalLine, JournalLinesPage } from '@/lib/api';

const line = (over: Partial<JournalLine>): JournalLine => ({
  lineId: '1',
  entryId: '10',
  date: '2026-09-10',
  memo: 'Delivered: 2000',
  accountCode: '1100',
  accountName: 'COD receivable',
  debit: '275000',
  credit: '0',
  originType: 'shipment_sale',
  originId: '9',
  shipmentId: '9',
  isReversal: false,
  reversed: false,
  balance: null,
  ...over,
});

const page = (lines: JournalLine[], over: Partial<JournalLinesPage> = {}): JournalLinesPage => ({
  total: lines.length,
  page: 1,
  pageSize: 50,
  debit: '275000',
  credit: '0',
  opening: null,
  closing: null,
  lines,
  ...over,
});

const render = (data: JournalLinesPage, closed: string[]) =>
  renderToStaticMarkup(
    <StaticRouter location="/reports">
      <LinesTable data={data} title="Test" closed={new Set(closed)} />
    </StaticRouter>,
  );

describe('closed periods are unmistakable', () => {
  const data = page([line({ lineId: '1', date: '2026-08-31' }), line({ lineId: '2', date: '2026-09-01' })]);
  const html = render(data, ['2026-08']);
  const rows = html.split('<tr').filter((r) => r.includes('data-closed'));

  it('marks a line in a closed month with a lock, the word Closed, a heavy edge and a tint', () => {
    const closedRow = rows.find((r) => r.includes('2026-08-31'))!;
    expect(closedRow).toContain('data-closed="true"');
    expect(closedRow).toContain('Closed');
    expect(closedRow).toContain('border-l-4');
    expect(closedRow).toContain('bg-slate-500/10');
    expect(closedRow).toContain('<svg');
  });

  it('leaves a line in an open month plain', () => {
    const openRow = rows.find((r) => r.includes('2026-09-01'))!;
    expect(openRow).toContain('data-closed="false"');
    expect(openRow).not.toContain('Closed');
    expect(openRow).not.toContain('border-l-4');
  });

  it('says in a banner which closed months a report period includes, and what that means', () => {
    const banner = renderToStaticMarkup(<ClosedBanner months={['2026-08', '2026-07']} />);
    expect(banner).toContain('2 closed months');
    expect(banner).toContain('Aug 2026, Jul 2026');
    expect(banner).toContain('final');
    expect(renderToStaticMarkup(<ClosedBanner months={[]} />)).toBe('');
  });
});

describe('drilling to the lines', () => {
  it('opens each line\'s whole entry from its number', () => {
    const html = render(page([line({ entryId: '42' })]), []);
    expect(html).toContain('#42');
    expect(html).toContain('aria-expanded="false"');
  });

  it('shows totals over the whole filter, not the page, so a figure can be tied to its lines', () => {
    const html = render(page([line({})], { total: 1234, debit: '99999900', credit: '99999900' }), []);
    expect(html).toContain('All 1,234 lines');
    expect(html).toContain('Rs 999,999.00');
  });

  it('marks a reversal and the entry it reversed, and links the parcel', () => {
    const html = render(page([line({ reversed: true }), line({ lineId: '2', isReversal: true })]), []);
    expect(html).toContain('Reversed');
    expect(html).toContain('Reversal');
    expect(html).toContain('href="/parcels/9"');
  });
});

describe('a general ledger', () => {
  const ledger = page([line({ lineId: '1', balance: '1275000' }), line({ lineId: '2', debit: '0', credit: '100', balance: '1274900' })], { opening: '1000000', closing: '1274900' });

  it('shows the balance brought forward, a running balance on every line and the closing balance', () => {
    const html = render(ledger, []);
    expect(html).toContain('Brought forward');
    expect(html).toContain('Rs 10,000.00');
    expect(html).toContain('Rs 12,750.00');
    expect(html).toContain('Rs 12,749.00');
    expect(html).toContain('>Balance<');
  });

  it('shows the brought-forward row only on the first page', () => {
    expect(render({ ...ledger, page: 2 }, [])).not.toContain('Brought forward');
  });

  it('has no balance column when the lines are not one account', () => {
    expect(render(page([line({})]), [])).not.toContain('>Balance<');
  });
});
