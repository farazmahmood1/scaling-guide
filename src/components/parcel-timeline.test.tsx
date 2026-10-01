import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ParcelTimeline } from '@/components/parcel-timeline';
import { STATUS_LABELS, timelineEntries } from '@/lib/postex';

const render = (events: Parameters<typeof timelineEntries>[0]) => renderToStaticMarkup(<ParcelTimeline entries={timelineEntries(events)} />);

describe('parcel timeline', () => {
  it('renders every verified status code with its human label', () => {
    const events = Object.keys(STATUS_LABELS).map((code) => ({ code, message: 'x', occurredAt: '2026-09-01T05:00:00Z' }));
    const html = render(events);
    for (const label of Object.values(STATUS_LABELS)) expect(html).toContain(label);
    expect(html).not.toContain('Unknown code');
  });

  it('shows Karachi time, not UTC', () => {
    // 19:30 UTC on 1 Sep is 00:30 on 2 Sep in Karachi (UTC+5).
    const html = render([{ code: '0005', message: 'Delivered', occurredAt: '2026-09-01T19:30:00Z' }]);
    expect(html).toContain('2 Sept 2026, 00:30 PKT');
  });

  it('renders a code it does not know, marked, in PostEx\'s words', () => {
    const html = render([{ code: '0099', message: 'Shifted to hub', occurredAt: '2026-09-01T05:00:00Z' }]);
    expect(html).toContain('Shifted to hub (code 0099)');
    expect(html).toContain('Unknown code');
  });

  it('does not crash on an empty code, a missing time or a time that is not a date', () => {
    const html = render([
      { code: '', message: '', occurredAt: null },
      { code: '0013', message: 'Attempt Made: CNA(CUSTOMER NOT AVAILABLE)', occurredAt: 'not a date' },
      { code: '0005', message: undefined as unknown as string, occurredAt: null },
    ]);
    expect(html).toContain('Status update');
    expect(html).toContain('Customer not available');
    expect(html).toContain('Delivered');
  });

  it('says so when PostEx has reported nothing', () => {
    expect(render([])).toContain('nothing on this parcel yet');
  });
});
