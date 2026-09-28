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
 * @param referringDriverId - Optional UUID of the driver who referred the rider.
 * @returns The newly created `DealClaim`, or an error.
 */
export async function claimDeal(
  dealId: string,
  referringDriverId?: string
): Promise<ApiResult<DealClaim>> {
  try {
    const { data, error } = await supabase.functions.invoke("claim-deal", {
      body: {
        deal_id: dealId,
        referring_driver_id: referringDriverId || null,
      },
    });

    if (error) return { data: null, error: error.message };
    return { data: data as DealClaim, error: null };
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
    const { error } = await supabase
      .from("deal_claims")
      .update({ status: "cancelled" })
      .eq("id", claimId);

    if (error) return { data: null, error: error.message };
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
 * Upload a ride receipt image and link it to a claim.
 *
 * 1. Uploads the image to the `receipts` storage bucket.
 * 2. Retrieves the public URL for the uploaded file.
 * 3. Updates the `deal_claims.ride_receipt_url` column.
 *
 * @param claimId - UUID of the claim to attach the receipt to.
 * @param imageUri - Local file URI of the receipt image.
 * @returns The public URL of the uploaded receipt, or an error.
 */
export async function uploadReceipt(
  claimId: string,
  imageUri: string
): Promise<ApiResult<{ ride_receipt_url: string }>> {
  try {
    const fileName = `receipts/${claimId}/${Date.now()}.jpg`;

    const response = await fetch(imageUri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(fileName, arrayBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) return { data: null, error: uploadError.message };

    const {
      data: { publicUrl },
    } = supabase.storage.from("receipts").getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from("deal_claims")
      .update({ ride_receipt_url: publicUrl })
      .eq("id", claimId);

    if (updateError) return { data: null, error: updateError.message };

    return { data: { ride_receipt_url: publicUrl }, error: null };
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
