import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/api';
import { GROUPED_PERMISSIONS, MIN_PASSWORD_LENGTH, PERMISSION_GROUPS, generatePassword, holds, passwordProblem } from '@/lib/accounts';

describe('passwords', () => {
  it('asks what the server asks: length, and no one character repeated', () => {
    expect(passwordProblem('short')).toBe(`At least ${MIN_PASSWORD_LENGTH} characters`);
    expect(passwordProblem('a'.repeat(20))).toBe('Not one character repeated');
    expect(passwordProblem('x'.repeat(201) + 'y')).toBe('At most 200 characters');
    expect(passwordProblem('correct horse battery')).toBeNull();
  });

  it('counts characters, not bytes', () => {
    expect(passwordProblem('پاسورڈپاسورڈ')).toBeNull();
    expect(passwordProblem('پاسورڈ')).not.toBeNull();
  });

  it('makes a readable password that the server will accept', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
      expect(passwordProblem(p)).toBeNull();
    }
  });

  it('is random: two are not the same, and it asks the random source, not a pattern', () => {
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBeGreaterThan(15);
    let calls = 0;
    generatePassword(() => (calls++, 0));
    expect(calls).toBe(5);
  });
});

describe('the role table', () => {
  it('names every permission the server has, so none can be granted unseen', () => {
    expect([...GROUPED_PERMISSIONS].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('lists each permission once, under one heading', () => {
    expect(new Set(GROUPED_PERMISSIONS).size).toBe(GROUPED_PERMISSIONS.length);
    expect(PERMISSION_GROUPS.map((g) => g.heading)).toEqual(['Looking', 'Doing', 'Running the system']);
  });

  it('reads whether a role holds a permission', () => {
    const matrix = [
      { role: 'agent' as const, permissions: ['confirmations.work' as const] },
      { role: 'accountant' as const, permissions: ['reports.read' as const] },
    ];
    expect(holds(matrix, 'agent', 'confirmations.work')).toBe(true);
    expect(holds(matrix, 'agent', 'reports.read')).toBe(false);
    expect(holds(matrix, 'owner', 'reports.read')).toBe(false);
  });
});
