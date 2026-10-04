import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/auth/auth-context';
import type { OrderDetailData } from '@/lib/api';
import { OrderDetailPage, OrderView } from '@/pages/order-detail';

// Names, phones and addresses here are made up.
const order: OrderDetailData = {
  id: '12',
  orderNumber: '#9001',
  store: 'nur',
  channel: 'online',
  source: 'api',
  state: 'delivered',
  placedAt: '2026-09-01T05:00:00Z',
  cancelledAt: null,
  cancelReason: null,
  financialStatus: 'pending',
  fulfillmentStatus: null,
  tags: ['vip'],
  discountCodes: ['GLOW10'],
  influencer: { name: 'Test Creator', handle: 'test.creator' },
  money: { subtotalPaisa: '260000', discountPaisa: '10000', shippingPaisa: '0', taxPaisa: '0', totalPaisa: '250000' },
  customer: { name: 'Test Customer', phone: '+923000000000', address: { line1: '1 Example Road', line2: null, city: 'Lahore', province: 'Punjab', postal: '54000', country: 'PK' } },
  lines: [
    { title: 'Glow Serum', sku: 'GS-30', qty: 2, unitPaisa: '130000', discountPaisa: '10000', totalPaisa: '250000' },
    { title: 'Day Cream', sku: null, qty: 1, unitPaisa: '0', discountPaisa: '0', totalPaisa: '0' },
  ],
  confirmation: { state: 'confirmed', source: 'desk', attempts: 2, agent: 'Test Agent', confirmedAt: '2026-09-01T07:00:00Z', lastAttemptAt: '2026-09-01T07:00:00Z', nextAttemptAt: null, outcomeReason: null },
  attempts: [
    { at: '2026-09-01T07:00:00Z', agent: 'Test Agent', channel: 'call', outcome: 'confirmed', followUpAt: null, reason: null, note: 'Asked for the evening' },
    { at: '2026-09-01T06:00:00Z', agent: 'Test Agent', channel: 'whatsapp', outcome: 'no_answer', followUpAt: null, reason: null, note: null },
  ],
  parcels: [
    {
      id: '34',
      trackingNumber: 'T000000001',
      stage: 'delivered',
      statusLabel: 'Delivered',
      statusMessage: null,
      bookedAt: '2026-09-02T05:00:00Z',
      deliveredAt: '2026-09-03T05:00:00Z',
      codPaisa: '240000',
      attempts: 1,
      lastFailureReason: 'Customer not available',
      daysInTransit: 1,
      charges: [{ kind: 'forward', amountPaisa: '20000' }],
      payouts: [{ cprNumber: 'CPR-1', paidAt: '2026-09-10T05:00:00Z', amountPaisa: '220000' }],
    },
  ],
  history: [
    { at: '2026-09-01T05:00:00Z', from: null, to: 'placed', cause: 'Placed; not yet confirmed' },
    { at: '2026-09-03T05:00:00Z', from: 'placed', to: 'delivered', cause: 'Delivered' },
  ],
  openItems: [],
  books: true,
  profitPaisa: '123400',
};

const view = (o: OrderDetailData, canOpenParcels = true, canSeePhone = true) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <OrderView order={o} canOpenParcels={canOpenParcels} canSeePhone={canSeePhone} />
    </MemoryRouter>,
  );

describe('an order opened in full', () => {
  const html = view(order);

  it('names the order, its state and where it came from', () => {
    expect(html).toContain('#9001');
    expect(html).toContain('Delivered');
    expect(html).toContain('NUR by Juggun');
    expect(html).toContain('payment pending');
  });

  it('lists the items with their prices, then adds up the money', () => {
    for (const text of ['Glow Serum', 'GS-30', 'Day Cream', '3 units across 2 products', 'Subtotal', 'Shipping', 'Tax']) expect(html).toContain(text);
    expect(html).toContain('Rs 2,500.00');
  });

  it('shows the customer, the street and the code and influencer behind the discount', () => {
    for (const text of ['Test Customer', '+923000000000', '1 Example Road', 'Lahore, Punjab, 54000', 'GLOW10', 'Test Creator', '@test.creator', 'vip']) expect(html).toContain(text);
  });

  it('shows every call the desk made, newest first, with the notes', () => {
    expect(html).toContain('Confirmation call');
    expect(html).toContain('2 contacts made');
    expect(html).toContain('Asked for the evening');
    expect(html.indexOf('Confirmed')).toBeLessThan(html.indexOf('No answer'));
    expect(html).toContain('WhatsApp');
  });

  it('shows the parcel, flags a COD that differs from the order, and links it', () => {
    expect(html).toContain('T000000001');
    expect(html).toContain('href="/parcels/34"');
    expect(html).toContain('Customer not available');
    expect(html).toMatch(/font-medium text-brand-coral">Rs 2,400\.00/);
  });

  it('shows the charges, the payout and what the order made, for a role that may read the books', () => {
    for (const text of ['Delivery charge', 'Paid out (CPR-1)', 'What it made', 'Rs 1,234.00']) expect(html).toContain(text);
  });

  it('shows a real SKU and not the placeholder Shopify gives a product without one', () => {
    const html = view({ ...order, lines: [{ ...order.lines[0]!, sku: '0' }, { ...order.lines[1]!, sku: 'DC-1' }] });
    expect(html).toContain('DC-1');
    expect(html).not.toMatch(/font-mono text-xs text-muted-foreground">0</);
  });

  it('says so when PostEx has delivered a parcel and not yet paid it out', () => {
    expect(view({ ...order, parcels: order.parcels.map((p) => ({ ...p, payouts: [] })) })).toContain('Not paid out yet');
    expect(view(order)).not.toContain('Not paid out yet');
  });

  it('lists the order\'s history, oldest first', () => {
    expect(html).toContain('Placed → Delivered');
    expect(html.indexOf('Placed; not yet confirmed')).toBeLessThan(html.indexOf('Delivered</p>'));
  });
});

describe('what a role may not see is not drawn', () => {
  it('leaves out the phone, the street, the charges and the profit', () => {
    const html = view({
      ...order,
      books: false,
      profitPaisa: null,
      customer: { name: 'Test Customer', phone: null, address: { line1: null, line2: null, city: 'Lahore', province: 'Punjab', postal: null, country: 'PK' } },
      parcels: order.parcels.map((p) => ({ ...p, charges: null, payouts: null })),
    });
    for (const text of ['+923000000000', '1 Example Road', 'Delivery charge', 'Paid out', 'What it made']) expect(html).not.toContain(text);
    expect(html).toContain('Lahore, Punjab');
  });

  it('does not draw a phone number the role may not see, even if one were sent', () => {
    const html = view(order, true, false);
    expect(html).not.toContain('+923000000000');
    expect(html).toContain('Test Customer');
  });

  it('does not link a parcel to a role that may not open parcels', () => {
    const html = view(order, false);
    expect(html).toContain('T000000001');
    expect(html).not.toContain('href="/parcels/34"');
  });
});

describe('an order that is not settled, or has little yet', () => {
  it('says the profit comes once it is delivered, rather than showing zero', () => {
    const html = view({ ...order, state: 'in_transit', profitPaisa: null });
    expect(html).toContain('What it made');
    expect(html).toContain('Shown once the order is delivered or returned');
  });

  it('copes with no parcel, no confirmation and no history', () => {
    const html = view({ ...order, parcels: [], confirmation: null, attempts: [], history: [], customer: { name: null, phone: null, address: null } });
    expect(html).toContain('No parcel has been booked for this order.');
    expect(html).toContain('The desk has not looked at this order yet.');
    expect(html).toContain('No changes recorded.');
  });

  it('leaves the confirmation call out for a PR package, which is never phoned', () => {
    const html = view({ ...order, channel: 'pr', confirmation: null, attempts: [] });
    expect(html).not.toContain('Confirmation call');
    expect(html).toContain('>PR<');
  });

  it('shows a cancellation, and what is open on the reconciliation queue', () => {
    const html = view({ ...order, cancelledAt: '2026-09-02T05:00:00Z', cancelReason: 'customer', openItems: [{ id: '1', kind: 'cancelled_but_booked', severity: 'error', detail: {} }] });
    expect(html).toContain('Cancelled in Shopify');
    expect(html).toContain('Open on the reconciliation queue');
  });
});

describe('the page while the order loads', () => {
  it('holds its place and offers the way back', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/orders/12']}>
        <AuthProvider>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="Loading the order"');
    expect(html).toContain('All orders');
    expect(html).toContain('href="/orders"');
  });
});
