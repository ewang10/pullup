/**
 * Password policy shared by web and mobile sign-up / reset forms.
 *
 * Must match Supabase Auth settings (Authentication -> Providers -> Email):
 * minimum length 10, requires lowercase, uppercase and digits. Supabase is the
 * source of truth; this only gives users feedback before they submit.
 */

export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_REQUIREMENTS_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, and a number.`;

/** Returns an error message, or null when the password meets the policy. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include an uppercase letter, a lowercase letter, and a number.';
  }
  return null;
}
