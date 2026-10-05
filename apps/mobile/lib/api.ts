/**
 * @file api.ts
 * Data-access layer for the PullUp mobile app.
 *
 * Every function in this module talks to Supabase (tables, RPCs, edge
 * functions, or storage) and returns a normalised `ApiResult<T>`.
 *
 * Domain types are imported from `@pullup/shared` so the mobile layer
 * stays in sync with the database schema.
 */

import { supabase } from "./supabase";
import { RECEIPTS_BUCKET, receiptObjectPath, type ReceiptType } from "@pullup/shared";
import type {
  DealWithSlots,
  DealWithVenue,
  DealClaim,
  DealClaimWithDeal,
  DriverStats,
} from "@pullup/shared";

/** Standardised wrapper returned by every API helper. */
interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

/** Flat row shape returned by the `get_nearby_deals` RPC. */
interface NearbyDealRow {
  deal_id: string;
  title: string;
  description: string | null;
  discount_type: DealWithSlots["discount_type"];
  discount_value: number;
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
  daily_cap: number;
  hold_duration_minutes: number;
  deal_created_at: string;
  venue_id: string;
  venue_name: string;
  venue_address: string;
  venue_latitude: number;
  venue_longitude: number;
  venue_category: DealWithSlots["venue"]["category"];
  distance_miles: number;
  slots_remaining: number;
}

/** Map an RPC row to the nested `DealWithSlots` shape the screens use. */
function toDealWithSlots(row: NearbyDealRow): DealWithSlots {
  return {
    id: row.deal_id,
    venue_id: row.venue_id,
    title: row.title,
    description: row.description ?? "",
    discount_type: row.discount_type,
    discount_value: Number(row.discount_value),
    ride_credit_amount: Number(row.ride_credit_amount),
    driver_kickback_amount: Number(row.driver_kickback_amount),
    platform_fee_amount: Number(row.platform_fee_amount),
    daily_cap: row.daily_cap,
    hold_duration_minutes: row.hold_duration_minutes,
    // Not returned by the RPC; the claim screen reads them from the deal itself.
    requires_ride_receipt: false,
    requires_venue_receipt: false,
    is_active: true,
    created_at: row.deal_created_at,
    distance_miles: Number(row.distance_miles),
    slots_remaining: row.slots_remaining,
    // The RPC returns only the venue fields the list and map need.
    venue: {
      id: row.venue_id,
      owner_user_id: "",
      name: row.venue_name,
      description: "",
      category: row.venue_category,
      address: row.venue_address,
      city: "",
      state: "",
      latitude: Number(row.venue_latitude),
      longitude: Number(row.venue_longitude),
      image_url: null,
      stripe_customer_id: null,
      is_active: true,
      created_at: "",
    },
  };
}

async function callNearbyDeals(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<ApiResult<DealWithSlots[]>> {
  const { data, error } = await supabase.rpc("get_nearby_deals", {
    user_lat: lat,
    user_lng: lng,
    radius_miles: radiusMiles,
  });
  if (error) return { data: null, error: error.message };
  return { data: ((data ?? []) as NearbyDealRow[]).map(toDealWithSlots), error: null };
}

/** Portfolio demo venue shown when a viewer has no real deals nearby. */
const DEMO_VENUE_ID = process.env.EXPO_PUBLIC_DEMO_VENUE_ID;

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Fetch the demo venue's active deals, marked `is_demo`.
 *
 * Returns an empty list when `EXPO_PUBLIC_DEMO_VENUE_ID` is not set, so
 * non-demo builds never show demo data. Distances are measured from the
 * viewer when their location is known.
 */
export async function fetchDemoDeals(
  userLat?: number,
  userLng?: number
): Promise<ApiResult<DealWithSlots[]>> {
  if (!DEMO_VENUE_ID) return { data: [], error: null };
  try {
    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("latitude, longitude")
      .eq("id", DEMO_VENUE_ID)
      .single();
    if (venueError || !venue?.latitude || !venue?.longitude) {
      return { data: [], error: null };
    }

    const venueLat = Number(venue.latitude);
    const venueLng = Number(venue.longitude);
    const { data, error } = await callNearbyDeals(venueLat, venueLng, 0.5);
    if (error) return { data: null, error };

    const deals = (data ?? [])
      .filter((d) => d.venue_id === DEMO_VENUE_ID)
      .map((d) => ({
        ...d,
        is_demo: true,
        distance_miles:
          userLat != null && userLng != null
            ? milesBetween(userLat, userLng, venueLat, venueLng)
            : 0,
      }));
    return { data: deals, error: null };
  } catch (err) {
    return { data: null, error: "Failed to fetch demo deals" };
  }
}

/**
 * Fetch deals near a geographic point.
 *
 * Calls the `get_nearby_deals` Postgres RPC which returns deals joined
 * with venue info, remaining daily slots, and distance in miles. When
 * nothing is nearby, falls back to the demo venue's deals (if configured).
 *
 * @param lat - User's current latitude.
 * @param lng - User's current longitude.
 * @param radiusMiles - Search radius in miles (default 10).
 * @returns A list of `DealWithSlots` ordered by distance.
 */
export async function fetchNearbyDeals(
  lat: number,
  lng: number,
  radiusMiles: number = 10
): Promise<ApiResult<DealWithSlots[]>> {
  try {
    const result = await callNearbyDeals(lat, lng, radiusMiles);
    if (result.error || (result.data && result.data.length > 0)) return result;
    return fetchDemoDeals(lat, lng);
  } catch (err) {
    return { data: null, error: "Failed to fetch nearby deals" };
  }
}

/**
 * Fetch full details for a single deal, including its venue.
 *
 * Queries the `deals` table with a nested select on `venues` to build
 * a `DealWithVenue` object suitable for a detail screen.
 *
 * @param dealId - UUID of the deal to fetch.
 * @returns The deal joined with its venue, or an error.
 */
export async function fetchDealDetail(
  dealId: string
): Promise<ApiResult<DealWithVenue>> {
  try {
    const { data, error } = await supabase
      .from("deals")
      .select(
        `
        *,
        venue:venues (
          id,
          name,
          description,
          category,
          address,
          city,
          state,
          latitude,
          longitude,
          image_url
        )
      `
      )
      .eq("id", dealId)
      .single();

    if (error) return { data: null, error: error.message };

    return { data: data as unknown as DealWithVenue, error: null };
  } catch (err) {
    return { data: null, error: "Failed to fetch deal details" };
  }
}

/**
 * Reserve (claim) a deal for the current rider.
 *
 * Invokes the `claim-deal` edge function which performs slot-availability
 * checks, creates the `deal_claims` row, and returns the new claim.
 *
 * @param dealId - UUID of the deal to claim.
 * @returns The newly created `DealClaim`, or an error.
 */
export async function claimDeal(dealId: string): Promise<ApiResult<DealClaim>> {
  try {
    const { data, error } = await supabase.functions.invoke("claim-deal", {
      // Drivers are added afterwards with linkDriver (approved drivers only).
      body: { deal_id: dealId },
    });

    if (error) {
      // Show the function's reason, e.g. "Daily cap reached for this deal".
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return { data: null, error: body?.error ?? error.message };
    }
    // claim-deal responds with { claim, deal }.
    const claim = (data?.claim ?? data) as DealClaim;
    if (!claim?.id) return { data: null, error: "Claim was created but couldn't be opened. Check your Claims tab." };
    return { data: claim, error: null };
  } catch (err) {
    return { data: null, error: "Failed to claim deal" };
  }
}

/**
 * Cancel a previously reserved claim.
 *
 * Directly updates the `deal_claims` row to set `status = 'cancelled'`.
 *
 * @param claimId - UUID of the claim to cancel.
 * @returns A success flag, or an error.
 */
export async function cancelClaim(
  claimId: string
): Promise<ApiResult<{ success: boolean }>> {
  try {
    // Riders can't change claim status directly; cancel-claim checks the
    // claim is theirs and still reserved.
    const { error } = await supabase.functions.invoke("cancel-claim", { body: { claim_id: claimId } });
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return { data: null, error: body?.error ?? error.message };
    }
    return { data: { success: true }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to cancel claim" };
  }
}

/**
 * Mark a claim as completed (venue-side confirmation).
 *
 * Invokes the `complete-claim` edge function which validates that the
 * requesting user owns the venue, updates the claim status, and triggers
 * downstream financial transactions.
 *
 * @param claimId - UUID of the claim to complete.
 * @param venueId - UUID of the venue confirming the visit.
 * @returns The updated `DealClaim`, or an error.
 */
export async function completeClaim(
  claimId: string,
  venueId: string
): Promise<ApiResult<DealClaim>> {
  try {
    const { data, error } = await supabase.functions.invoke("complete-claim", {
      body: {
        claim_id: claimId,
        venue_id: venueId,
      },
    });

    if (error) return { data: null, error: error.message };
    return { data: data as DealClaim, error: null };
  } catch (err) {
    return { data: null, error: "Failed to complete claim" };
  }
}

/**
 * Check in by typing the venue's check-in code instead of scanning its QR
 * code (for riders who can't use the camera). Same rules as scanning.
 */
export async function completeClaimWithCode(
  claimId: string,
  checkinCode: string
): Promise<ApiResult<{ completed: true }>> {
  try {
    const { error } = await supabase.functions.invoke("complete-claim", {
      body: { claim_id: claimId, checkin_code: checkinCode },
    });
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return { data: null, error: body?.error ?? error.message };
    }
    return { data: { completed: true }, error: null };
  } catch {
    return { data: null, error: "Check-in failed" };
  }
}

/**
 * Link the rider's driver to an active claim using the driver's code, so the
 * driver earns the bonus when the visit completes. Calls `link-driver`, which
 * only accepts reserved claims with no driver linked yet.
 *
 * @returns The driver's name to show the rider, or an error.
 */
export async function linkDriver(
  claimId: string,
  driverCode: string
): Promise<ApiResult<{ driver_name: string }>> {
  try {
    const { data, error } = await supabase.functions.invoke("link-driver", {
      body: { claim_id: claimId, referral_code: driverCode },
    });
    if (error) {
      // Surface the function's own message (e.g. "Driver not found for this referral code").
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      const message = body?.error === "Driver not found for this referral code"
        ? "No driver found with that code. Check it and try again."
        : body?.error ?? error.message;
      return { data: null, error: message };
    }
    return { data: data as { driver_name: string }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to link driver" };
  }
}

/**
 * Upload a receipt photo for a completed visit and submit it for staff review.
 *
 * Receipts are private: the image goes to receipts/<claim_id>/<type>-<time>.jpg
 * and the claim stores that storage path with status "pending_review".
 * Uploading again after a rejection replaces the photo and resubmits it.
 *
 * @param type - "ride" (rideshare trip receipt) or "venue" (the bill).
 */
export async function uploadReceipt(
  claimId: string,
  imageUri: string,
  type: ReceiptType
): Promise<ApiResult<{ path: string }>> {
  try {
    const path = receiptObjectPath(claimId, `${type}-${Date.now()}.jpg`);

    const response = await fetch(imageUri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: false });
    if (uploadError) return { data: null, error: uploadError.message };

    const { error: updateError } = await supabase
      .from("deal_claims")
      .update(
        type === "ride"
          ? { ride_receipt_url: path, ride_receipt_status: "pending_review" }
          : { venue_receipt_url: path, venue_receipt_status: "pending_review" }
      )
      .eq("id", claimId);
    if (updateError) return { data: null, error: updateError.message };

    return { data: { path }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to upload receipt" };
  }
}

/**
 * Fetch all claims belonging to the currently authenticated rider.
 *
 * Queries the `deal_claims` table with a nested join through
 * `deals -> venues` so each claim includes full deal and venue details.
 * Results are ordered newest-first by `reserved_at`.
 *
 * @returns A list of `DealClaimWithDeal` objects, or an error.
 */
export async function fetchMyClaims(): Promise<ApiResult<DealClaimWithDeal[]>> {
  try {
    const { data, error } = await supabase
      .from("deal_claims")
      .select(
        `
        *,
        deal:deals (
          *,
          venue:venues (
            id,
            name,
            description,
            category,
            address,
            city,
            state,
            latitude,
            longitude,
            image_url
          )
        )
      `
      )
      .order("reserved_at", { ascending: false });

    if (error) return { data: null, error: error.message };

    return { data: (data ?? []) as unknown as DealClaimWithDeal[], error: null };
  } catch (err) {
    return { data: null, error: "Failed to fetch claims" };
  }
}

/**
 * Fetch aggregated statistics for the current driver's dashboard.
 *
 * Calls the `get_driver_stats` Postgres RPC which returns totals for
 * referrals, earnings, payout balance, and completed claims.
 *
 * @returns A `DriverStats` object, or an error.
 */
export async function fetchDriverStats(): Promise<ApiResult<DriverStats>> {
  try {
    const { data, error } = await supabase.rpc("get_driver_stats");

    if (error) return { data: null, error: error.message };
    // The RPC RETURNS TABLE, so PostgREST sends a one-row array.
    const row = (Array.isArray(data) ? data[0] : data) as Partial<DriverStats> | undefined;
    if (!row) return { data: null, error: "No driver stats found" };
    return {
      data: {
        ...row,
        total_referrals: Number(row.total_referrals ?? 0),
        total_earnings: Number(row.total_earnings ?? 0),
        payout_balance: Number(row.payout_balance ?? 0),
        completed_claims: Number(row.completed_claims ?? 0),
      } as DriverStats,
      error: null,
    };
  } catch (err) {
    return { data: null, error: "Failed to fetch driver stats" };
  }
}

/** A rider who added the calling driver's code to at least one claim. */
export interface DriverRider {
  rider_id: string;
  rider_display_name: string;
  rides: number;
  completed_visits: number;
  earned: number;
  last_ride_at: string;
}

/**
 * Fetch riders who added the current driver's code to a claim, newest first.
 * Calls the `get_driver_riders` RPC (first name + last initial only).
 */
export async function fetchDriverRiders(): Promise<ApiResult<DriverRider[]>> {
  try {
    const { data, error } = await supabase.rpc("get_driver_riders");
    if (error) return { data: null, error: error.message };
    return {
      data: ((data ?? []) as DriverRider[]).map((r) => ({
        ...r,
        rides: Number(r.rides),
        completed_visits: Number(r.completed_visits),
        earned: Number(r.earned),
      })),
      error: null,
    };
  } catch (err) {
    return { data: null, error: "Failed to fetch riders" };
  }
}

// ── Payouts (Stripe Connect) ──────────────────────────────────

export type PayoutKind = "driver" | "rider";

const PAYOUT_FUNCTIONS: Record<PayoutKind, { connect: string; cashout: string }> = {
  driver: { connect: "create-driver-connect-account", cashout: "cashout-driver" },
  rider: { connect: "create-connect-account", cashout: "cashout" },
};

async function functionErrorMessage(error: unknown): Promise<string> {
  const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
  return body?.error ?? (error instanceof Error ? error.message : "Something went wrong");
}

/**
 * Get a Stripe link: onboarding for new payout accounts, or the Stripe
 * Express dashboard once set up. Identity and bank details are entered on
 * Stripe's site, never in PullUp.
 */
export async function getPayoutLink(kind: PayoutKind): Promise<ApiResult<{ url: string }>> {
  try {
    const { data, error } = await supabase.functions.invoke(PAYOUT_FUNCTIONS[kind].connect, { body: {} });
    if (error) return { data: null, error: await functionErrorMessage(error) };
    if (!data?.url) return { data: null, error: "Stripe didn't return a link. Try again." };
    return { data: { url: data.url as string }, error: null };
  } catch {
    return { data: null, error: "Failed to open payout setup" };
  }
}

/** Transfer the full available balance to the user's payout account. */
export async function cashOut(kind: PayoutKind): Promise<ApiResult<{ amount: number }>> {
  try {
    const { data, error } = await supabase.functions.invoke(PAYOUT_FUNCTIONS[kind].cashout, { body: {} });
    if (error) return { data: null, error: await functionErrorMessage(error) };
    return { data: { amount: Number(data?.amount ?? 0) }, error: null };
  } catch {
    return { data: null, error: "Cash out failed" };
  }
}

export interface PayoutHistoryItem {
  id: string;
  kind: "earned" | "cashout";
  label: string;
  amount: number;
  status: string;
  /** Not settled yet (waiting for receipts, or a cash-out still processing). */
  pending: boolean;
  at: string;
}

export interface PayoutAccount {
  balance: number;
  onboardingComplete: boolean;
  onHold: boolean;
  history: PayoutHistoryItem[];
}

/** Driver: bonuses earned (per visit) and cash-outs, newest first. */
export async function fetchDriverPayouts(userId: string): Promise<ApiResult<PayoutAccount>> {
  try {
    const [profile, bonuses, cashouts, stats] = await Promise.all([
      supabase.from("driver_profiles").select("stripe_onboarding_complete, payouts_on_hold").eq("user_id", userId).single(),
      supabase.rpc("get_driver_kickback_history"),
      supabase.from("driver_transactions").select("id, amount, status, created_at").order("created_at", { ascending: false }).limit(50),
      fetchDriverStats(),
    ]);
    if (profile.error) return { data: null, error: profile.error.message };
    const history: PayoutHistoryItem[] = [
      ...((bonuses.data ?? []) as { transaction_id: string; venue_name: string; amount: number; kickback_paid: boolean; earned_at: string }[]).map((b) => ({
        id: b.transaction_id,
        kind: "earned" as const,
        label: `Bonus · ${b.venue_name}`,
        amount: Number(b.amount),
        status: b.kickback_paid ? "Paid out" : "Available",
        pending: false,
        at: b.earned_at,
      })),
      ...((cashouts.data ?? []) as { id: string; amount: number; status: string; created_at: string }[]).map((c) => ({
        id: c.id,
        kind: "cashout" as const,
        label: "Cash out to bank",
        amount: Number(c.amount),
        status: c.status === "completed" ? "Sent" : c.status === "failed" ? "Failed" : "Processing",
        pending: c.status !== "completed" && c.status !== "failed",
        at: c.created_at,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      data: {
        balance: stats.data?.payout_balance ?? 0,
        onboardingComplete: Boolean(profile.data.stripe_onboarding_complete),
        onHold: Boolean(profile.data.payouts_on_hold),
        history,
      },
      error: null,
    };
  } catch {
    return { data: null, error: "Failed to load payouts" };
  }
}

/** Rider: ride credits earned on approved visits and cash-outs, newest first. */
export async function fetchRiderWallet(userId: string): Promise<ApiResult<PayoutAccount>> {
  try {
    const [profile, credits, cashouts] = await Promise.all([
      supabase.from("rider_profiles").select("balance, stripe_onboarding_complete").eq("user_id", userId).single(),
      supabase
        .from("transactions")
        .select("id, amount, status, created_at, deal_claim:deal_claims!inner(rider_user_id, deal:deals(title))")
        .eq("type", "ride_reimbursement")
        .eq("deal_claim.rider_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("rider_transactions").select("id, amount, status, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (profile.error) return { data: null, error: profile.error.message };
    type CreditRow = { id: string; amount: number; status: string; created_at: string; deal_claim: { deal: { title: string } | null } };
    const history: PayoutHistoryItem[] = [
      ...((credits.data ?? []) as unknown as CreditRow[])
        .filter((t) => t.status !== "voided")
        .map((t) => ({
          id: t.id,
          kind: "earned" as const,
          label: `Ride credit · ${t.deal_claim?.deal?.title ?? "Deal"}`,
          amount: Number(t.amount),
          status: t.status === "completed" ? "Added" : t.status === "failed" ? "Failed" : "Waiting for receipts",
          pending: t.status === "pending",
          at: t.created_at,
        })),
      ...((cashouts.data ?? []) as { id: string; amount: number; status: string; created_at: string }[]).map((c) => ({
        id: c.id,
        kind: "cashout" as const,
        label: "Cash out to bank",
        amount: Number(c.amount),
        status: c.status === "completed" ? "Sent" : c.status === "failed" ? "Failed" : "Processing",
        pending: c.status !== "completed" && c.status !== "failed",
        at: c.created_at,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      data: {
        balance: Number(profile.data.balance ?? 0),
        onboardingComplete: Boolean(profile.data.stripe_onboarding_complete),
        onHold: false,
        history,
      },
      error: null,
    };
  } catch {
    return { data: null, error: "Failed to load wallet" };
  }
}
