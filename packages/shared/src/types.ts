// ─── Enums ───────────────────────────────────────────────

/** Defines the three user roles in the PullUp platform */
export type UserRole = 'rider' | 'driver' | 'venue_admin';

/** Category classification for venues */
export type VenueCategory =
  | 'restaurant'
  | 'bar'
  | 'nightclub'
  | 'attraction'
  | 'experience'
  | 'dispensary'
  | 'other';

/** How the discount is expressed: a percentage off or a fixed dollar amount */
export type DiscountType = 'percentage' | 'fixed_amount';

/** Lifecycle status of a deal claim */
export type ClaimStatus = 'reserved' | 'completed' | 'expired' | 'cancelled';

/** The kind of financial transaction recorded in the ledger */
export type TransactionType =
  | 'venue_charge'
  | 'ride_reimbursement'
  | 'driver_kickback'
  | 'platform_fee';

/** Processing status of a financial transaction */
export type TransactionStatus = 'pending' | 'completed' | 'failed';

// ─── Database Row Types ──────────────────────────────────

/** Row type for the public.users table. Created automatically by the handle_new_user trigger. */
export interface User {
  /** Unique user identifier (UUID from Supabase Auth) */
  id: string;
  /** User's email address */
  email: string;
  /** User's phone number, if provided */
  phone: string | null;
  /** User's full display name */
  full_name: string;
  /** Role assigned to this user */
  role: UserRole;
  /** URL to the user's avatar image */
  avatar_url: string | null;
  /** ISO-8601 timestamp of account creation */
  created_at: string;
}

/** Row type for driver_profiles table. Stores driver-specific data including referral code and earnings. */
export interface DriverProfile {
  /** Unique driver profile identifier */
  id: string;
  /** Foreign key to the users table */
  user_id: string;
  /** Unique referral code shared with riders */
  referral_code: string;
  /** Lifetime earnings in dollars */
  total_earnings: number;
  /** Current unpaid balance available for payout */
  payout_balance: number;
  /** Stripe Connect account identifier for payouts */
  stripe_account_id: string | null;
  /** Whether the driver has completed identity verification */
  is_verified: boolean;
  /** ISO-8601 timestamp of profile creation */
  created_at: string;
}

/** Row type for venues table. Represents a business venue that offers deals. */
export interface Venue {
  /** Unique venue identifier */
  id: string;
  /** Foreign key to the venue admin user */
  owner_user_id: string;
  /** Display name of the venue */
  name: string;
  /** Short description of the venue */
  description: string;
  /** Business category of the venue */
  category: VenueCategory;
  /** Street address */
  address: string;
  /** City name */
  city: string;
  /** State abbreviation */
  state: string;
  /** GPS latitude coordinate */
  latitude: number;
  /** GPS longitude coordinate */
  longitude: number;
  /** URL to the venue's hero/cover image */
  image_url: string | null;
  /** Stripe customer ID used for billing the venue */
  stripe_customer_id: string | null;
  /** Whether the venue is currently active and visible */
  is_active: boolean;
  /** ISO-8601 timestamp of venue creation */
  created_at: string;
}

/** Row type for deals table. Represents a discount/promotion offered by a venue. */
export interface Deal {
  /** Unique deal identifier */
  id: string;
  /** Foreign key to the venue offering this deal */
  venue_id: string;
  /** Short marketing title */
  title: string;
  /** Longer description of the deal */
  description: string;
  /** Whether the discount is a percentage or fixed amount */
  discount_type: DiscountType;
  /** Numeric value of the discount (e.g. 20 for 20% or $20) */
  discount_value: number;
  /** Dollar amount credited toward the rider's ride fare */
  ride_credit_amount: number;
  /** Dollar amount paid to the referring driver */
  driver_kickback_amount: number;
  /** Dollar amount retained by the platform */
  platform_fee_amount: number;
  /** Maximum number of claims allowed per day */
  daily_cap: number;
  /** Minutes a reservation is held before it expires */
  hold_duration_minutes: number;
  /** Whether the deal is currently active and claimable */
  is_active: boolean;
  /** ISO-8601 timestamp of deal creation */
  created_at: string;
}

/** Row type for deal_claims table. Tracks a rider's claim of a specific deal. */
export interface DealClaim {
  /** Unique claim identifier */
  id: string;
  /** Foreign key to the deal being claimed */
  deal_id: string;
  /** Foreign key to the rider who claimed the deal */
  rider_user_id: string;
  /** Foreign key to the driver who referred the rider, if any */
  referring_driver_id: string | null;
  /** Current lifecycle status of the claim */
  status: ClaimStatus;
  /** ISO-8601 timestamp when the claim was reserved */
  reserved_at: string;
  /** ISO-8601 timestamp when the reservation expires */
  expires_at: string;
  /** ISO-8601 timestamp when the claim was completed, if applicable */
  completed_at: string | null;
  /** URL to the uploaded ride receipt image */
  ride_receipt_url: string | null;
  /** Whether the ride receipt has been verified */
  ride_receipt_verified: boolean;
  /** Whether the ride credit has been paid to the rider */
  ride_credit_paid: boolean;
  /** Whether the driver kickback has been paid */
  driver_kickback_paid: boolean;
  /** Whether the venue has been charged for this claim */
  venue_charged: boolean;
  /** ISO-8601 timestamp of claim creation */
  created_at: string;
}

/** Row type for transactions table. Records a single financial ledger entry tied to a claim. */
export interface Transaction {
  /** Unique transaction identifier */
  id: string;
  /** Foreign key to the associated deal claim */
  deal_claim_id: string;
  /** Kind of financial transaction */
  type: TransactionType;
  /** Dollar amount of the transaction */
  amount: number;
  /** Stripe payment intent or transfer ID */
  stripe_payment_id: string | null;
  /** Processing status of the transaction */
  status: TransactionStatus;
  /** ISO-8601 timestamp of transaction creation */
  created_at: string;
}

/** Row type for referrals table. Records the link between a driver and a rider they referred. */
export interface Referral {
  /** Unique referral identifier */
  id: string;
  /** Foreign key to the referring driver's profile */
  driver_id: string;
  /** Foreign key to the referred rider user */
  rider_user_id: string;
  /** The referral code that was used */
  referral_code_used: string;
  /** ISO-8601 timestamp of referral creation */
  created_at: string;
}

// ─── Joined / Extended Types ─────────────────────────────

/** Deal joined with its parent venue. Used for display in lists and detail views. */
export interface DealWithVenue extends Deal {
  /** The venue that owns this deal */
  venue: Venue;
}

/** Claim joined with its deal and venue. Used in the claims list screen. */
export interface DealClaimWithDeal extends DealClaim {
  /** The deal (with venue) associated with this claim */
  deal: DealWithVenue;
}

/** Deal with computed availability info, returned by the get_nearby_deals RPC */
export interface DealWithSlots extends DealWithVenue {
  /** Number of remaining claim slots for today */
  slots_remaining: number;
  /** Distance from the querying user in miles */
  distance_miles: number;
}

/** Claim with full deal and venue details, used on the mobile claim detail screen */
export interface ClaimWithDetails extends DealClaim {
  /** The deal associated with this claim */
  deal: DealWithVenue;
  /** Rider's full name */
  rider_name: string;
  /** Rider's email */
  rider_email: string;
}

/** Aggregated statistics for a driver's dashboard. */
export interface DriverStats {
  /** Total number of riders referred by this driver */
  total_referrals: number;
  /** Lifetime earnings in dollars */
  total_earnings: number;
  /** Current unpaid balance available for payout */
  payout_balance: number;
  /** Number of claims that reached 'completed' status */
  completed_claims: number;
}

// ─── API Request/Response Types ──────────────────────────

/** Request body for the sign-up endpoint */
export interface SignUpRequest {
  /** User's email address */
  email: string;
  /** User's chosen password */
  password: string;
  /** User's full display name */
  full_name: string;
  /** Role the user is registering as */
  role: UserRole;
  /** Optional driver referral code used during sign-up */
  referral_code?: string;
}

/** Request body for creating a new deal */
export interface CreateDealRequest {
  /** The venue this deal belongs to */
  venue_id: string;
  /** Short marketing title */
  title: string;
  /** Longer description of the deal */
  description: string;
  /** Whether the discount is a percentage or fixed amount */
  discount_type: DiscountType;
  /** Numeric value of the discount */
  discount_value: number;
  /** Dollar amount credited toward the rider's ride fare */
  ride_credit_amount: number;
  /** Dollar amount paid to the referring driver */
  driver_kickback_amount: number;
  /** Dollar amount retained by the platform */
  platform_fee_amount: number;
  /** Maximum number of claims allowed per day */
  daily_cap: number;
  /** Minutes a reservation is held before it expires (defaults on server) */
  hold_duration_minutes?: number;
}

/** Request body for claiming a deal */
export interface ClaimDealRequest {
  /** The deal to claim */
  deal_id: string;
  /** Optional referring driver's profile ID */
  referring_driver_id?: string;
}

/** Request body for verifying a QR code scan at a venue */
export interface VerifyQRRequest {
  /** The venue where the QR code was scanned */
  venue_id: string;
  /** The claim being verified */
  claim_id: string;
}
