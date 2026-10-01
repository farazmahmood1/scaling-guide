import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ReviewItemCard } from '@/components/review-item';
import type { ReviewItem } from '@/lib/api';

const item = (kind: string, detail: Record<string, unknown>, extra: Partial<ReviewItem> = {}): ReviewItem => ({
  id: '1',
  kind,
  severity: 'warning',
  status: 'open',
  storeKey: 'nur',
  orderId: null,
  orderNumber: null,
  shipmentId: '9',
  trackingNumber: '20000000000001',
  detail,
  note: null,
  resolvedBy: null,
  createdAt: '2026-09-20T06:00:00Z',
  resolvedAt: null,
  ...extra,
});

const render = (i: ReviewItem) =>
  renderToStaticMarkup(
    <StaticRouter location="/reconciliation">
      <ul>
        <ReviewItemCard item={i} onClosed={() => {}} />
      </ul>
    </StaticRouter>,
  );

const FIVE = [
  item('unmatched_shipment', { orderRefNumber: 'JO-12', reason: 'foreign_ref_prefix' }),
  item('cod_mismatch', { orderNumber: '#1201', codPaisa: '275000', expectedPaisa: '275100', differencePaisa: '-100', zeroCod: false }),
  item('possible_duplicate_booking', { orderNumber: '#1201', trackingNumbers: ['20000000000001', '20000000000002'] }),
  item('stuck_in_transit', { statusCode: '0008', since: '2026-09-10T06:00:00Z', days: 9 }),
  item('postex_unknown_status', { code: '0099', exampleTrackingNumber: '20000000000003' }),
];

describe('the five rule kinds in the queue', () => {
  it('each renders its own presentation and its own actions', () => {
    const html = FIVE.map(render);
    // Linking is offered for a parcel without an order, and only there.
    expect(html.map((h) => h.includes('Link order'))).toEqual([true, false, false, false, false]);
    // Each kind's own wording of "resolved" and "ignored".
    for (const [i, [resolve, ignore]] of [['No order exists', 'Not an order parcel'], ['Corrected', 'COD is right'], ['Extra cancelled', 'Intentional re-send'], ['Chased with PostEx', 'Expected delay'], ['Code understood', 'Not important']].entries()) {
      expect(html[i]).toContain(resolve);
      expect(html[i]).toContain(ignore);
    }
    // Each kind's own body.
    expect(html[0]).toContain('Not matched: the reference has a prefix this store does not use');
    expect(html[1]).toContain('PostEx collects');
    expect(html[1]).toContain('Rs 2,750.00');
    expect(html[2]).toContain('2 live parcels');
    expect(html[3]).toContain('Days without change');
    expect(html[4]).toContain('One decision covers every parcel');
  });

  it('shows the matcher\'s confidence on a weak match, and lets a person unlink it', () => {
    const html = render(item('match_suggested', { method: 'phone_window', confidence: 0.6 }, { orderNumber: '#1201' }));
    expect(html).toContain('Confidence');
    expect(html).toContain('60%');
    expect(html).toContain('Match is right');
    expect(html).toContain('Wrong order: unlink');
  });

  it('opens each duplicate parcel directly when its id is known, and by search when it is not', () => {
    const paired = render(item('possible_duplicate_booking', { orderNumber: '#1201', parcels: [{ id: '31', trackingNumber: 'T-A' }, { id: '47', trackingNumber: 'T-B' }] }));
    expect(paired).toContain('href="/parcels/31"');
    expect(paired).toContain('href="/parcels/47"');
    const old = render(item('possible_duplicate_booking', { orderNumber: '#1201', trackingNumbers: ['T-A'] }));
    expect(old).toContain('href="/parcels?q=T-A"');
  });

  it('offers no actions on an item already closed, and shows who closed it and why', () => {
    const html = render(item('cod_mismatch', { codPaisa: '1', expectedPaisa: '2', differencePaisa: '-1' }, { status: 'resolved', resolvedAt: '2026-09-21T06:00:00Z', resolvedBy: 'a@x.test', note: 'Fixed' }));
    expect(html).not.toContain('Corrected');
    expect(html).toContain('a@x.test');
    expect(html).toContain('Fixed');
  });

  it('renders a kind it does not know, and a detail with missing fields, without crashing', () => {
    expect(() => render(item('something_new', { orderNumber: '#5' }))).not.toThrow();
    for (const i of FIVE) expect(() => render({ ...i, detail: {} })).not.toThrow();
  });
});
