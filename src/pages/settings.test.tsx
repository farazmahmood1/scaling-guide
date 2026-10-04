import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/auth/auth-context';
import { SettingsPage } from '@/pages/settings';

const page = (url = '/settings') =>
  renderToStaticMarkup(
    <StaticRouter location={url}>
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    </StaticRouter>,
  );

describe('the settings page', () => {
  it('has every section the task lists, as tabs', () => {
    const html = page();
    for (const label of ['Connections', 'Alerts', 'Purchasing', 'Order tags', 'Month close']) expect(html).toContain(label);
  });

  it('opens on connections, or on the section named in the address', () => {
    expect(page()).toMatch(/aria-selected="true"[^>]*>[^<]*Connections/);
    expect(page('/settings?section=alerts')).toMatch(/aria-selected="true"[^>]*>[^<]*Alerts/);
    expect(page('/settings?section=nonsense')).toMatch(/aria-selected="true"[^>]*>[^<]*Connections/);
  });

  it('points to where the matching prefixes are, rather than repeating them', () => {
    expect(page()).toContain('href="/reconciliation"');
  });
});
