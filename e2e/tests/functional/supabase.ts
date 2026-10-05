/**
 * Direct access to the local CI Supabase for functional tests: create
 * throwaway users, act as a rider through the same edge functions the app
 * calls, and check results with the service role. Local only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
export const TEST_PASSWORD = 'E2e-Test-Pass1!';

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL)) {
  throw new Error('Functional tests need SUPABASE_URL pointing at a local Supabase.');
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client for setup and assertions (bypasses RLS). */
export const admin = createClient(URL, SERVICE, options);

let counter = 0;
/** A unique, single-word name so staff pages show it in full. */
export const uniqueName = (prefix: string) => `${prefix}${Date.now().toString(36)}${counter++}`;

/** Create a confirmed user through Auth, so the sign-up trigger runs as for real users. */
export async function createUser(role: 'rider' | 'driver' | 'venue_admin', fullName: string) {
  const email = `${fullName.toLowerCase()}@pullup.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: fullName },
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

/** A client signed in as the given user, like the app after sign-in. */
export async function signedIn(email: string, password = TEST_PASSWORD): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Call an edge function; returns its JSON and the error message the app would show. */
export async function invoke<T = Record<string, unknown>>(client: SupabaseClient, fn: string, body: object) {
  const { data, error } = await client.functions.invoke(fn, { body });
  if (!error) return { data: data as T, error: null };
  const parsed = await (error as { context?: Response }).context?.json?.().catch(() => null);
  return { data: null, error: (parsed?.error as string) ?? error.message };
}

/** The newest email sent to an address (local Supabase captures mail in Mailpit). */
export async function latestEmailTo(address: string, timeoutMs = 20_000): Promise<{ html: string; subject: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
      if (messages?.length) {
        const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json();
        return { html: msg.HTML as string, subject: messages[0].Subject };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${address} within ${timeoutMs}ms`);
}

/** A 1×1 PNG, standing in for a receipt photo. */
export const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
