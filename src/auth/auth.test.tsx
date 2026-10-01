import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/auth/auth-context';
import { RoleMatrixTable, UsersAdmin } from '@/components/users-admin';
import { TotpEnrolment } from '@/components/totp-enrolment';
import type { RoleMatrix } from '@/lib/api';
import { AccountPage } from '@/pages/account';
import { EnrolmentGate } from '@/pages/enrolment-gate';
import { LoginPage } from '@/pages/login';
import { SettingsPage } from '@/pages/settings';

const render = (node: React.ReactNode, url = '/') =>
  renderToStaticMarkup(
    <StaticRouter location={url}>
      <AuthProvider>{node}</AuthProvider>
    </StaticRouter>,
  );

describe('signing in', () => {
  it('asks for an email and a password, and is labelled for assistive technology', () => {
    const html = render(<LoginPage />);
    expect(html).toContain('Sign in');
    expect(html).toMatch(/<label[^>]*for="email"/);
    expect(html).toMatch(/<label[^>]*for="password"/);
    expect(html).toContain('autoComplete="current-password"');
  });
});

describe('setting up the authenticator app', () => {
  it('starts with what it is and a button, and shows no QR code until asked', () => {
    const html = render(<TotpEnrolment account="a@test.example" onDone={() => {}} />);
    expect(html).toContain('Set up the authenticator app');
    expect(html).toContain('Google Authenticator');
    expect(html).not.toContain('data-testid="qr-code"');
    expect(html).not.toContain('Check the code and turn it on');
  });

  it('is the whole screen for an owner or manager who has not done it', () => {
    const html = render(<EnrolmentGate />);
    expect(html).toContain('One more step before you start');
    expect(html).toContain('Set up the authenticator app');
    expect(html).toContain('Sign out');
  });

  it('is on the account page for everyone, beside the password', () => {
    const html = render(<AccountPage />, '/account');
    expect(html).toContain('My account');
    expect(html).toContain('Authenticator app');
    expect(html).toContain('Change password');
    expect(html).toMatch(/<label[^>]*for="current-password"/);
  });
});

const MATRIX: RoleMatrix = {
  roles: [
    { role: 'agent', label: 'Confirmation agent', permissions: ['orders.read', 'confirmations.work', 'pii.phone'] },
    { role: 'accountant', label: 'Accountant', permissions: ['dashboard.read', 'accounting.read', 'reports.read'] },
  ],
  permissions: [],
};

describe('user management', () => {
  it('shows what each role may do as a table, with a tick or a dash that screen readers can read', () => {
    const html = renderToStaticMarkup(<RoleMatrixTable matrix={MATRIX} />);
    expect(html).toContain('Confirmation agent');
    expect(html).toContain('Accountant');
    expect(html).toContain("See customers&#x27; phone numbers");
    expect(html).toContain('aria-label="Allowed"');
    expect(html).toContain('aria-label="Not allowed"');
    // The agent row for phone numbers is a tick, the accountant's a dash.
    const row = /<th scope="row"[^>]*>See customers&#x27; phone numbers<\/th>(.*?)<\/tr>/s.exec(html)?.[1] ?? '';
    const cells = row.split('</td>').filter((c) => c.includes('aria-label'));
    expect(cells[0]).toContain('Allowed');
    expect(cells[1]).toContain('Not allowed');
  });

  it('is not offered on the settings page to someone who may not manage users', () => {
    // No permissions yet (nothing has loaded): the Users tab is not there.
    const html = render(<SettingsPage />, '/settings');
    expect(html).not.toContain('Users and roles');
    expect(render(<SettingsPage />, '/settings?section=users')).not.toContain('Users and roles');
  });

  it('loads its own accounts and the matrix, with a place held while it does', () => {
    const html = render(<UsersAdmin />);
    expect(html).toContain('What each role may do');
    expect(html).toContain('the table the server enforces');
  });
});

describe('a customer\'s phone number never reaches a role that may not see one', () => {
  // Every source file of the app, as text (Vite reads them raw; no Node needed), minus the tests.
  const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  // Reading a customer's number off something the server sent: `order.phone`, `row.customerPhone`, a link made from one.
  const SHOWS_A_PHONE = /\b(order|row|r|p|parcel|customer|history|detail|data)\.(phone|customerPhone)\b|\.(whatsappUrl|callUrl|customerPhone)\b/;

  it('only appears on screens that ask for the phone permission first', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('/lib/api.ts'))
      .filter(([, text]) => SHOWS_A_PHONE.test(text) && !text.includes("'pii.phone'"))
      .map(([path]) => path);
    expect(Object.keys(sources).length, 'the scan found the app\'s sources').toBeGreaterThan(50);
    expect(offenders, 'these files show a phone number without checking the pii.phone permission').toEqual([]);
  });

  it('is found where the desk shows one, so the guard is looking at the right thing', () => {
    const desk = sources['/src/pages/confirmations.tsx']!;
    expect(SHOWS_A_PHONE.test(desk)).toBe(true);
    expect(desk).toContain("can('pii.phone')");
  });
});