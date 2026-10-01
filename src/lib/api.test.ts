import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, UNAUTHORIZED_EVENT, apiGet, getToken, setToken } from '@/lib/api';

// Tests run in Node, not a browser: only the two globals the client touches are stubbed, so a
// DOM library is not needed.
const storage = new Map<string, string>();
const events = new EventTarget();

const respond = (status: number, body: unknown, statusText = '') =>
  vi.fn().mockResolvedValue(
    new Response(body === undefined ? 'not json' : JSON.stringify(body), { status, statusText }),
  );

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', events);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends the stored session token and returns the body', async () => {
    setToken('session-token');
    const fetch = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetch);

    await expect(apiGet('/api/v1/auth/me')).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer session-token' });
  });

  it('drops an expired session and tells the app to show sign-in', async () => {
    setToken('expired');
    vi.stubGlobal('fetch', respond(401, { error: { message: 'Session expired' } }));
    const signedOut = vi.fn();
    events.addEventListener(UNAUTHORIZED_EVENT, signedOut);

    const error = await apiGet('/api/v1/auth/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: 'Session expired' });
    expect(getToken()).toBeNull();
    expect(signedOut).toHaveBeenCalledOnce();
    events.removeEventListener(UNAUTHORIZED_EVENT, signedOut);
  });

  it('does not sign out on a 401 from the sign-in form itself', async () => {
    // No token yet: a wrong password must show its message, not bounce to sign-in.
    vi.stubGlobal('fetch', respond(401, { error: { message: 'Wrong email or password' } }));
    const signedOut = vi.fn();
    events.addEventListener(UNAUTHORIZED_EVENT, signedOut);

    await expect(apiGet('/api/v1/auth/login')).rejects.toMatchObject({ message: 'Wrong email or password' });
    expect(signedOut).not.toHaveBeenCalled();
    events.removeEventListener(UNAUTHORIZED_EVENT, signedOut);
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', respond(502, undefined, 'Bad Gateway'));

    await expect(apiGet('/api/v1/integrations/health')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });
});
