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

/**
 * Fetch deals near a geographic point.
 *
 * Calls the `get_nearby_deals` Postgres RPC which returns deals joined
 * with venue info, remaining daily slots, and distance in miles.
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
    const { data, error } = await supabase.rpc("get_nearby_deals", {
      user_lat: lat,
      user_lng: lng,
      radius_miles: radiusMiles,
    });

    if (error) return { data: null, error: error.message };
    return { data: data as DealWithSlots[], error: null };
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
    return { data: data as DriverStats, error: null };
  } catch (err) {
    return { data: null, error: "Failed to fetch driver stats" };
  }
}

/**
 * Fetch the list of riders referred by the current driver.
 *
 * Calls the `get_driver_referrals` Postgres RPC. Each row contains
 * the rider's name, email, number of completed claims, and the date
 * they joined via the referral link.
 *
 * @returns An array of referral summaries, or an error.
 */
export async function fetchDriverReferrals(): Promise<
  ApiResult<
    {
      id: string;
      rider_name: string;
      rider_email: string;
      total_claims: number;
      joined_at: string;
    }[]
  >
> {
  try {
    const { data, error } = await supabase.rpc("get_driver_referrals");

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: null, error: "Failed to fetch referrals" };
  }
}
