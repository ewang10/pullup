import { describe, expect, it } from 'vitest';
import { validatePassword } from '../src/password';

describe('validatePassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePassword('Abcdef1!')).toBeNull();
  });

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no lowercase', 'ABCDEFG1!'],
    ['no number', 'Abcdefgh!'],
    ['no symbol', 'Abcdefgh1'],
  ])('rejects a password with %s', (_label, pw) => {
    expect(validatePassword(pw)).not.toBeNull();
  });

  it('counts the symbols Supabase accepts', () => {
    for (const s of '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~') {
      expect(validatePassword(`Abcdef1${s}`), s).toBeNull();
    }
  });
});

describe('isDemoAccountEmail', () => {
  it('recognizes the shared demo accounts', async () => {
    const { isDemoAccountEmail } = await import('../src/password');
    expect(isDemoAccountEmail('pullup.demo.app@gmail.com')).toBe(true);
    expect(isDemoAccountEmail('PullUp.Demo.App+rider@gmail.com')).toBe(true);
    expect(isDemoAccountEmail('someone@gmail.com')).toBe(false);
    expect(isDemoAccountEmail('pullup.demo.app@gmail.com.evil.test')).toBe(false);
    expect(isDemoAccountEmail(null)).toBe(false);
  });
});
