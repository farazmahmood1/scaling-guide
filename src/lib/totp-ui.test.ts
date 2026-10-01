import { describe, expect, it } from 'vitest';

import { cleanCode, groupSecret, isCompleteCode, isSignInCode, looksLikeRecovery, recoveryCodesFile } from '@/lib/totp-ui';

describe('authenticator helpers', () => {
  it('shows the secret in groups of four for typing by hand', () => {
    expect(groupSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toBe('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
    expect(groupSecret('ABCDEF')).toBe('ABCD EF');
    expect(groupSecret(' AB CD ')).toBe('ABCD');
  });

  it('reads a code however it was typed or pasted', () => {
    expect(cleanCode('123 456')).toBe('123456');
    expect(cleanCode('123-456')).toBe('123456');
    expect(cleanCode('1234567890')).toBe('123456');
    expect(cleanCode('abc')).toBe('');
    expect(isCompleteCode('123 456')).toBe(true);
    expect(isCompleteCode('12345')).toBe(false);
  });

  it('tells a recovery code from an app code, and knows when either is the right shape to send', () => {
    expect(looksLikeRecovery('ABCDE-FGHJK')).toBe(true);
    expect(looksLikeRecovery('123456')).toBe(false);
    expect(isSignInCode('123456')).toBe(true);
    expect(isSignInCode('123 456')).toBe(true);
    expect(isSignInCode('ABCDE-FGHJK')).toBe(true);
    expect(isSignInCode('abcde fghjk')).toBe(true);
    expect(isSignInCode('ABCDE')).toBe(false);
    expect(isSignInCode('12345')).toBe(false);
    expect(isSignInCode('')).toBe(false);
  });

  it('writes the recovery codes as a keepable file', () => {
    const file = recoveryCodesFile(['AAAAA-BBBBB', 'CCCCC-DDDDD'], 'a@test.example');
    expect(file).toContain('Account: a@test.example');
    expect(file).toContain('AAAAA-BBBBB\nCCCCC-DDDDD');
    expect(file).toContain('works once');
  });
});
