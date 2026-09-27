/**
 * Password policy shared by web and mobile sign-up / reset forms.
 *
 * Must match Supabase Auth settings (Authentication -> Providers -> Email):
 * minimum length 8, requires lowercase, uppercase, digits and symbols.
 * Supabase is the source of truth; this only gives users feedback before
 * they submit. Change both together.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, a number, and a symbol (like ! @ # $).`;

// Symbol set accepted by Supabase Auth's "symbols" requirement.
const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

/** Returns an error message, or null when the password meets the policy. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !SYMBOLS.test(password)
  ) {
    return 'Password must include an uppercase letter, a lowercase letter, a number, and a symbol.';
  }
  return null;
}
