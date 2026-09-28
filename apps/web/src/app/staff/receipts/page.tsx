/**
 * Staff: review receipts for completed visits.
 *
 * A deal can require a ride receipt (proof the rider took a rideshare there)
 * and/or a venue receipt (proof they bought something). Money for the visit
 * (venue charge, rider credit, driver bonus) is held until every required
 * receipt is approved. Approve/reject goes through the verify-receipt edge
 * function, which settles the claim once everything required is approved.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/claims';
import { RECEIPTS_BUCKET, receiptPathFromStored, type ReceiptType } from '@pullup/shared';

interface QueueItem {
  claim_id: string;
  completed_at: string;
  deal_title: string;
  venue_name: string;
  rider_display_name: string;
  ride_credit_amount: number;
  requires_ride_receipt: boolean;
  requires_venue_receipt: boolean;
  ride_receipt_url: string | null;
  ride_receipt_status: string | null;
  venue_receipt_url: string | null;
  venue_receipt_status: string | null;
  has_driver: boolean;
}

const TYPE_LABEL: Record<ReceiptType, string> = { ride: 'Ride receipt', venue: 'Venue receipt' };

const STATUS_TEXT: Record<string, { label: string; className: string }> = {
  pending_review: { label: 'Waiting for review', className: 'bg-yellow-100 text-yellow-900' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-900' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-900' },
  missing: { label: 'Not uploaded yet', className: 'bg-gray-100 text-gray-800' },
};

function receiptState(item: QueueItem, type: ReceiptType) {
  const url = type === 'ride' ? item.ride_receipt_url : item.venue_receipt_url;
  const status = type === 'ride' ? item.ride_receipt_status : item.venue_receipt_status;
  return { url, status: url ? status ?? 'pending_review' : 'missing' };
}

export default function StaffReceiptsPage() {
  const supabase = createSupabaseBrowserClient();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Bill totals typed by staff for venue receipts, keyed by claim.
  const [billTotals, setBillTotals] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_receipt_queue');
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const queue = (data || []) as QueueItem[];
    setItems(queue);

    // Receipts are private: fetch short-lived signed links for the photos.
    const paths = queue
      .flatMap((q) => [q.ride_receipt_url, q.venue_receipt_url])
      .map(receiptPathFromStored)
      .filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrls(paths, 60 * 30);
      const map: Record<string, string> = {};
      (signed || []).forEach((s) => {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      });
      setImages(map);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (item: QueueItem, type: ReceiptType, approved: boolean) => {
    const key = `${item.claim_id}:${type}`;
    // Approving a venue receipt records the bill total (real spend data for the venue).
    const billTotal = Number(billTotals[item.claim_id]);
    if (approved && type === 'venue') {
      if (!billTotals[item.claim_id] || !Number.isFinite(billTotal) || billTotal <= 0) {
        setError('Enter the bill total from the receipt before approving it.');
        return;
      }
    }
    setBusyKey(key);
    setError(null);
    if (approved && type === 'venue') {
      const { error: billError } = await supabase.rpc('set_venue_bill_amount', {
        p_claim_id: item.claim_id,
        p_amount: billTotal,
      });
      if (billError) {
        setBusyKey(null);
        setError(billError.message);
        return;
      }
    }
    const { data, error: err } = await supabase.functions.invoke('verify-receipt', {
      body: { claim_id: item.claim_id, approved, receipt_type: type },
    });
    setBusyKey(null);
    if (err) {
      const body = await (err as { context?: Response }).context?.json?.().catch(() => null);
      setError(body?.error ?? err.message);
      return;
    }
    setNotice(
      `${TYPE_LABEL[type]} for ${item.rider_display_name} ${approved ? 'approved' : 'rejected'}. ${
        (data as { message?: string } | null)?.message ?? ''
      }`.trim()
    );
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Receipts to review</h1>
        <p className="text-gray-600 mt-1 max-w-3xl">
          Some deals require proof of the visit. Money for these visits is held until every required receipt is
          approved: then the venue is charged, the rider gets their ride credit, and the driver (if any) gets their
          bonus. Rejecting asks the rider to upload a new photo.
        </p>
      </div>

      <div aria-live="polite">
        {notice && (
          <p className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm">{notice}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
          <span className="sr-only">Loading receipts…</span>
        </div>
      ) : items.length === 0 ? (
        <p className="card text-center text-gray-600">No receipts waiting for review.</p>
      ) : (
        <ul className="space-y-6">
          {items.map((item) => {
            const types: ReceiptType[] = [
              ...(item.requires_ride_receipt || item.ride_receipt_url ? (['ride'] as const) : []),
              ...(item.requires_venue_receipt || item.venue_receipt_url ? (['venue'] as const) : []),
            ];
            return (
              <li key={item.claim_id} className="card">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{item.deal_title}</h2>
                    <p className="text-sm text-gray-700">
                      {item.venue_name} · {item.rider_display_name} · visited{' '}
                      {new Date(item.completed_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <p className="text-sm text-gray-700">
                    On approval: {formatCurrency(Number(item.ride_credit_amount))} ride credit
                    {item.has_driver ? ' + driver bonus' : ''}
                  </p>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {types.map((type) => {
                    const { url, status } = receiptState(item, type);
                    const path = receiptPathFromStored(url);
                    const src = path ? images[path] : undefined;
                    const badge = STATUS_TEXT[status] ?? STATUS_TEXT.pending_review;
                    const busy = busyKey === `${item.claim_id}:${type}`;
                    return (
                      <section key={type} className="rounded-lg border border-gray-200 p-3" aria-label={TYPE_LABEL[type]}>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-medium text-gray-900">{TYPE_LABEL[type]}</h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        {src ? (
                          <a href={src} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt={`${TYPE_LABEL[type]} uploaded by ${item.rider_display_name} for ${item.deal_title}`}
                              className="w-full max-h-72 object-contain rounded-md bg-gray-100"
                            />
                            <span className="sr-only"> (opens full size in a new tab)</span>
                          </a>
                        ) : url ? (
                          <p className="mt-3 text-sm text-gray-700">Photo unavailable.</p>
                        ) : (
                          <p className="mt-3 text-sm text-gray-700">The rider hasn&apos;t uploaded this yet.</p>
                        )}
                        {status === 'pending_review' && type === 'venue' && (
                          <div className="mt-3">
                            <label htmlFor={`bill-${item.claim_id}`} className="block text-sm font-medium text-gray-900">
                              Bill total on the receipt ($)
                            </label>
                            <input
                              id={`bill-${item.claim_id}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.01}
                              value={billTotals[item.claim_id] ?? ''}
                              onChange={(e) => setBillTotals((t) => ({ ...t, [item.claim_id]: e.target.value }))}
                              className="input-field mt-1"
                              placeholder="e.g. 33.83"
                              aria-describedby={`bill-help-${item.claim_id}`}
                            />
                            <p id={`bill-help-${item.claim_id}`} className="text-xs text-gray-600 mt-1">
                              Required to approve. Shown to the venue as real spend from PullUp customers.
                            </p>
                          </div>
                        )}
                        {status === 'pending_review' && (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => review(item, type, true)}
                              className="btn-primary flex-1"
                            >
                              {busy ? 'Saving…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => review(item, type, false)}
                              className="btn-secondary flex-1"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
