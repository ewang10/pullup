/**
 * Shared vocabulary for claims and venue costs, so every dashboard page
 * describes money and statuses the same way.
 *
 * - A claim is created when a rider reserves a deal in the app.
 * - A completed visit is a claim where the rider showed up; only these are
 *   charged to the venue.
 * - The venue's cost per completed visit is split into the rider's ride
 *   credit, the driver's bonus and PullUp's fee. The discount itself
 *   is given by the venue at checkout and never passes through PullUp.
 */

export type ClaimStatus = 'reserved' | 'completed' | 'expired' | 'cancelled';

/** Badge colors meet WCAG AA contrast (>= 4.5:1) for their text. */
export const CLAIM_STATUS: Record<ClaimStatus, { label: string; hint: string; className: string }> = {
  reserved: {
    label: 'On the way',
    hint: 'Rider reserved the deal and is heading over',
    className: 'bg-yellow-100 text-yellow-900',
  },
  completed: {
    label: 'Completed',
    hint: 'Rider visited; you were charged',
    className: 'bg-green-100 text-green-900',
  },
  expired: {
    label: "Didn't show",
    hint: 'Hold expired before the rider arrived; no charge',
    className: 'bg-gray-100 text-gray-800',
  },
  cancelled: {
    label: 'Cancelled',
    hint: 'Rider cancelled; no charge',
    className: 'bg-red-100 text-red-900',
  },
};

/** A completed visit whose required receipts weren't approved by the deadline. */
export const NOT_VERIFIED_STATUS = {
  label: 'Not verified',
  hint: "Receipts weren't provided in time; no charge",
  className: 'bg-gray-100 text-gray-800',
};

/** Counts as a completed (chargeable) visit. */
export function isChargeableVisit(c: { status: string; unverified_at?: string | null }): boolean {
  return c.status === 'completed' && !c.unverified_at;
}

export interface CostBreakdown {
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
}

/** Total the venue pays for one completed visit. */
export function costPerVisit(deal: Partial<CostBreakdown> | null | undefined): number {
  if (!deal) return 0;
  return (
    Number(deal.ride_credit_amount || 0) +
    Number(deal.driver_kickback_amount || 0) +
    Number(deal.platform_fee_amount || 0)
  );
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Percent change between two periods, or null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
