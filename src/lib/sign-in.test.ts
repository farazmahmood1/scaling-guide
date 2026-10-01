import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { needsCode, signInMessage } from '@/lib/sign-in';

describe('what a refused sign-in says', () => {
  it('explains a lockout, and a wrong code, in words', () => {
    expect(signInMessage(new ApiError('x', 423, 'locked'))).toContain('locked');
    expect(signInMessage(new ApiError('x', 401, 'totp_invalid'))).toContain('authenticator app');
  });

  it('passes on the server\'s own message otherwise, and has one for anything else', () => {
    expect(signInMessage(new ApiError('Wrong email or password', 401, 'invalid_credentials'))).toBe('Wrong email or password');
    expect(signInMessage(new Error('Network down'))).toBe('Network down');
    expect(signInMessage('weird')).toBe('Could not sign in');
  });

  it('knows when the password was right and only the code is missing', () => {
    expect(needsCode(new ApiError('Enter the code', 401, 'totp_required'))).toBe(true);
    expect(needsCode(new ApiError('Wrong email or password', 401, 'invalid_credentials'))).toBe(false);
    expect(needsCode(new Error('x'))).toBe(false);
  });
});
