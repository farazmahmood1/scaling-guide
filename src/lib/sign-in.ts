import { ApiError } from '@/lib/api';

/** What to tell someone about a refused sign-in, in words. A wrong password and an unknown email read the same on purpose. */
export const signInMessage = (cause: unknown): string => {
  if (cause instanceof ApiError) {
    if (cause.code === 'locked') return 'Too many wrong attempts. This account is locked for a few minutes; try again shortly, or ask an owner to unlock it.';
    if (cause.code === 'totp_invalid') return 'That code is not right. Use the current code from your authenticator app, or a recovery code.';
  }
  return cause instanceof Error ? cause.message : 'Could not sign in';
};

/** Whether a sign-in failure just means "now give the code": the password was right and the account has an authenticator. */
export const needsCode = (cause: unknown): boolean => cause instanceof ApiError && cause.code === 'totp_required';
