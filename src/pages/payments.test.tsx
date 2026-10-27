import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/auth/auth-context';
import type { PaymentsData } from '@/lib/api';
import { NoPayments, PaymentsPage, PaymentsSummary, PaymentsTable } from '@/pages/payments';

const data: PaymentsData = {
  window: '24h',
  since: '2026-10-26T13:00:00.000Z',
  until: '2026-10-27T13:00:00.000Z',
  lastPaidAt: '2026-10-27T07:00:00.000Z',
  rows: [
    {
      orderId: '322', orderNumber: '#64638', store: 'nur', trackingNumbers: ['26632200001195'], paidAt: '2026-10-27T07:00:00.000Z', cprNumbers: ['CPR-1'],
      payment: '251800', cod: '275000', deliveryFee: '20000', deliveryTax: '3200', revenue: '275000', goods: '90000', other: '0', profit: '161800',
    },
    {
      orderId: null, orderNumber: null, store: 'organics', trackingNumbers: ['20544400000468'], paidAt: '2026-10-27T06:00:00.000Z', cprNumbers: ['CPR-2'],
      payment: '130000', cod: '150000', deliveryFee: '20000', deliveryTax: '0', revenue: '150000', goods: '0', other: '0', profit: '130000',
    },
  ],
  totals: { orders: 2, parcels: 2, payment: '381800', cod: '425000', deliveryFee: '40000', deliveryTax: '3200', revenue: '425000', goods: '90000', profit: '291800' },
};

const render = (node: React.ReactNode) => renderToStaticMarkup(<StaticRouter location="/payments">{node}</StaticRouter>);

describe('the payments table', () => {
  const html = render(<PaymentsTable data={data} />);

  it('shows each order with its payment, what PostEx kept as fee plus tax, and the profit', () => {
    expect(html).toContain('href="/orders/322"');
    expect(html).toContain('Rs 2,518.00');
    expect(html).toContain('of Rs 2,750.00 COD');
    expect(html).toContain('Rs 200.00 + Rs 32.00');
    expect(html).toContain('= Rs 232.00');
    expect(html).toContain('Rs 1,618.00');
    expect(html).toContain('58.8%');
    expect(html).toContain('CPR CPR-1');
  });

  it('names a parcel with no order by its tracking number, and says when a cost price is missing', () => {
    expect(html).toContain('20544400000468');
    expect(html).toContain('No cost price');
    expect(html).toContain('1 order has no cost price on file');
  });

  it('adds the period up under the rows', () => {
    expect(html).toContain('Total · 2 orders');
    expect(html).toContain('Rs 3,818.00');
    expect(html).toContain('Rs 400.00 + Rs 32.00');
    expect(html).toContain('Rs 2,918.00');
  });

  it('says a parcel paid online had no cash to collect, rather than "of Rs 0.00 COD"', () => {
    const prepaid = { ...data.rows[0]!, cod: '0', payment: '-24360' };
    const markup = render(<PaymentsTable data={{ ...data, rows: [prepaid] }} />);
    expect(markup).toContain('−Rs 243.60');
    expect(markup).toContain('no cash to collect');
    expect(markup).not.toContain('of Rs 0.00 COD');
  });
});

describe('an empty period', () => {
  const empty: PaymentsData = { ...data, rows: [], lastPaidAt: '2026-10-23T05:24:12.000Z', totals: { ...data.totals, orders: 0 } };

  it('says when PostEx last paid, and offers the shortest period that shows it', () => {
    let chosen: string | null = null;
    const html = render(<NoPayments data={empty} label="Last 24 hours" onChoose={(key) => (chosen = key)} />);
    expect(html).toContain('No PostEx payments in the last 24 hours');
    expect(html).toContain('The last batch was paid on 23 Oct, 10:24.');
    expect(html).toContain('Show the last 7 days');
    expect(chosen).toBeNull();
  });

  it('says so when PostEx has paid nothing yet, and offers no period', () => {
    const html = render(<NoPayments data={{ ...empty, lastPaidAt: null }} label="Last 24 hours" onChoose={() => {}} />);
    expect(html).toContain('It has not paid anything out yet.');
    expect(html).not.toContain('Show the');
  });
});

describe('the payments summary', () => {
  it('gives the payment, what PostEx kept, the goods and the profit', () => {
    const html = render(<PaymentsSummary data={data} />);
    for (const label of ['Payment received', 'PostEx kept', 'Product cost', 'Profit']) expect(html).toContain(label);
    expect(html).toContain('Delivery Rs 400.00 + tax Rs 32.00');
    expect(html).toContain('Rs 432.00');
  });
});

describe('the payments page', () => {
  const page = (url: string) =>
    renderToStaticMarkup(
      <StaticRouter location={url}>
        <AuthProvider>
          <PaymentsPage />
        </AuthProvider>
      </StaticRouter>,
    );

  it('offers the four periods, opening on the last 24 hours, or on the one the address names', () => {
    const html = page('/payments');
    for (const label of ['Last 24 hours', 'Last 7 days', 'Last 14 days', 'Last 30 days']) expect(html).toContain(label);
    expect(html).toMatch(/<option value="24h" selected="">Last 24 hours<\/option>/);
    expect(page('/payments?window=14d')).toMatch(/<option value="14d" selected="">Last 14 days<\/option>/);
    expect(page('/payments?window=forever')).toMatch(/<option value="24h" selected="">/);
  });

  it('holds the table at its shape while the payments load', () => {
    expect(page('/payments')).toContain('aria-label="Loading payments"');
  });
});
