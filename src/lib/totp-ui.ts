/**
 * Small helpers for setting up and using an authenticator app: how a secret is shown for typing in
 * by hand, what counts as a finished code, and the recovery codes as a file.
 */

/** The secret in groups of four (`ABCD EFGH …`), the way apps display it, easier to copy by eye. */
export const groupSecret = (secret: string): string => secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

/** What was typed, reduced to digits and cut at six: a code pasted as `123 456` or `123-456` still works. */
export const cleanCode = (typed: string): string => typed.replace(/\D/g, '').slice(0, 6);

export const isCompleteCode = (typed: string): boolean => cleanCode(typed).length === 6;

/**
 * A sign-in code is six digits from the app, or a ten-character recovery code (`ABCDE-FGHJK`). Which
 * it is decides how it is shown while typing and whether it is shaped right to send.
 */
export const looksLikeRecovery = (typed: string): boolean => /[A-Za-z]/.test(typed);

export const isSignInCode = (typed: string): boolean => {
  const t = typed.trim();
  return looksLikeRecovery(t) ? t.replace(/[^A-Za-z0-9]/g, '').length === 10 : isCompleteCode(t);
};

/** The recovery codes as a text file a person can keep, with what they are for and that each works once. */
export const recoveryCodesFile = (codes: readonly string[], account: string): string =>
  [
    'NUR Organics: recovery codes',
    `Account: ${account}`,
    '',
    'Each code works once, in place of the code from your authenticator app.',
    'Keep them somewhere safe and separate from your phone.',
    '',
    ...codes,
    '',
  ].join('\n');
