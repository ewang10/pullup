/**
 * Venue payment method: link a US bank account for ACH debits.
 *
 * Flow: setup-venue-billing creates a Stripe SetupIntent; Stripe's hosted
 * Financial Connections window collects the bank (PullUp never sees account
 * numbers); the owner reads and accepts the ACH debit authorization; we
 * confirm the SetupIntent and save-venue-payment-method stores the result.
 */
'use client';

import { useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export interface BankInfo {
  has_payment_method: boolean;
  stripe_bank_last4: string | null;
  stripe_bank_institution: string | null;
}

type Step = 'idle' | 'opening' | 'authorize' | 'saving';

async function functionError(err: unknown): Promise<string> {
  const body = await (err as { context?: Response }).context?.json?.().catch(() => null);
  return body?.error ?? (err instanceof Error ? err.message : 'Something went wrong');
}

export default function PaymentMethodCard({
  bank,
  venueName,
  email,
  onLinked,
}: {
  bank: BankInfo | null;
  venueName: string;
  email: string;
  onLinked: () => void;
}) {
  const supabase = createSupabaseBrowserClient();
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ stripe: Stripe; clientSecret: string; bankLabel: string } | null>(null);

  const start = async () => {
    setError(null);
    setMessage(null);
    if (!PUBLISHABLE_KEY) {
      setError("Bank linking isn't configured yet (missing Stripe publishable key).");
      return;
    }
    setStep('opening');
    const { data, error: fnError } = await supabase.functions.invoke('setup-venue-billing');
    if (fnError || !data?.client_secret) {
      setError(fnError ? await functionError(fnError) : 'Could not start bank linking.');
      setStep('idle');
      return;
    }
    const stripe = await loadStripe(PUBLISHABLE_KEY);
    if (!stripe) {
      setError('Could not load Stripe. Check your connection and try again.');
      setStep('idle');
      return;
    }
    const { setupIntent, error: collectError } = await stripe.collectBankAccountForSetup({
      clientSecret: data.client_secret,
      params: {
        payment_method_type: 'us_bank_account',
        payment_method_data: { billing_details: { name: venueName, email } },
      },
      expand: ['payment_method'],
    });
    if (collectError) {
      setError(collectError.message ?? 'Bank linking failed.');
      setStep('idle');
      return;
    }
    if (setupIntent.status === 'requires_payment_method') {
      setMessage('Bank linking was cancelled. Nothing was saved.');
      setStep('idle');
      return;
    }
    const pm = setupIntent.payment_method;
    const bankLabel =
      pm && typeof pm === 'object' && pm.us_bank_account
        ? `${pm.us_bank_account.bank_name ?? 'Bank'} account ending in ${pm.us_bank_account.last4}`
        : 'the selected bank account';
    setPending({ stripe, clientSecret: data.client_secret, bankLabel });
    setStep('authorize');
  };

  const authorize = async () => {
    if (!pending) return;
    setStep('saving');
    setError(null);
    const { setupIntent, error: confirmError } = await pending.stripe.confirmUsBankAccountSetup(pending.clientSecret);
    if (confirmError || !setupIntent) {
      setError(confirmError?.message ?? 'Could not confirm the bank account.');
      setStep('authorize');
      return;
    }
    if (setupIntent.status === 'requires_action') {
      setMessage('Stripe will send small test deposits to verify this account. Finish verification from the email Stripe sends.');
      setPending(null);
      setStep('idle');
      return;
    }
    const { error: saveError } = await supabase.functions.invoke('save-venue-payment-method', {
      body: { setup_intent_id: setupIntent.id },
    });
    if (saveError) {
      setError(await functionError(saveError));
      setStep('authorize');
      return;
    }
    setPending(null);
    setStep('idle');
    setMessage('Bank account linked. You can now publish deals.');
    onLinked();
  };

  return (
    <section className="card mb-8" aria-labelledby="payment-method-heading">
      <h2 id="payment-method-heading" className="text-lg font-semibold text-gray-900">
        Payment method
      </h2>

      {bank?.has_payment_method ? (
        <p className="mt-2 text-gray-800">
          Charges are debited from your{' '}
          <span className="font-medium">
            {bank.stripe_bank_institution ?? 'bank'} account ending in {bank.stripe_bank_last4 ?? '••••'}
          </span>
          .
        </p>
      ) : (
        <p className="mt-2 text-gray-800">
          Link a bank account to publish deals. You&apos;re only charged when a rider completes a visit.
        </p>
      )}

      <div aria-live="polite">
        {message && <p className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm">{message}</p>}
      </div>
      {error && (
        <p role="alert" className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </p>
      )}

      {step === 'authorize' || step === 'saving' ? (
        <div className="mt-4 rounded-lg border border-gray-300 p-4">
          <h3 className="font-medium text-gray-900">Authorize debits from {pending?.bankLabel}</h3>
          <p className="mt-2 text-sm text-gray-800">
            By clicking &ldquo;Authorize and save&rdquo;, you authorize PullUp to debit this bank account for any amount
            owed for charges arising from your use of PullUp&apos;s services, until this authorization is revoked. You
            can change or cancel this authorization at any time by contacting PullUp with 30 days&apos; notice.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={authorize} disabled={step === 'saving'} className="btn-primary">
              {step === 'saving' ? 'Saving…' : 'Authorize and save'}
            </button>
            <button
              type="button"
              disabled={step === 'saving'}
              onClick={() => {
                setPending(null);
                setStep('idle');
                setMessage('Nothing was saved.');
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={start} disabled={step === 'opening'} className="btn-primary mt-4">
          {step === 'opening'
            ? 'Opening secure bank connection…'
            : bank?.has_payment_method
            ? 'Change bank account'
            : 'Link bank account'}
        </button>
      )}
      <p className="mt-3 text-xs text-gray-600">
        Bank details are handled by Stripe in a secure window; PullUp never sees your account number.
      </p>
    </section>
  );
}
