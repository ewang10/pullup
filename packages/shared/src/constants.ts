export const DEFAULT_HOLD_DURATION_MINUTES = 120;
export const DEFAULT_SEARCH_RADIUS_MILES = 10;
export const METERS_PER_MILE = 1609.34;

/**
 * Per-claim cost split ratios — set by PullUp, not configurable by venues.
 * Venues choose a total cost per claim; PullUp auto-splits it.
 */
export const CLAIM_COST_MIN = 10;
export const SPLIT_RIDE_CREDIT = 0.5;
export const SPLIT_DRIVER_KICKBACK = 0.2;
export const SPLIT_PLATFORM_FEE = 0.3;

/**
 * Calculate the per-claim cost breakdown from a venue's total budget.
 * Works in cents and gives the platform fee the rounding remainder, so the
 * three amounts always add up to exactly what the venue is charged.
 */
export function calculateClaimCosts(costPerClaim: number) {
  const total = Math.round(costPerClaim * 100);
  const ride = Math.round(total * SPLIT_RIDE_CREDIT);
  const driver = Math.round(total * SPLIT_DRIVER_KICKBACK);
  return {
    ride_credit_amount: ride / 100,
    driver_kickback_amount: driver / 100,
    platform_fee_amount: (total - ride - driver) / 100,
  };
}

export const VENUE_CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar' },
  { value: 'nightclub', label: 'Nightclub' },
  { value: 'attraction', label: 'Attraction' },
  { value: 'experience', label: 'Experience' },
  { value: 'dispensary', label: 'Dispensary' },
  { value: 'other', label: 'Other' },
] as const;

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
] as const;

export const CLAIM_STATUSES = {
  RESERVED: 'reserved',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export const QR_PREFIX = 'pullup://venue/';

export function generateQRContent(venueId: string): string {
  return `${QR_PREFIX}${venueId}/verify`;
}

export function parseQRContent(content: string): string | null {
  if (!content.startsWith(QR_PREFIX) || !content.endsWith('/verify')) {
    return null;
  }
  return content.slice(QR_PREFIX.length, -'/verify'.length);
}

/**
 * Driver codes: a rider scans (or types) their driver's code on an active
 * claim so the driver earns the bonus for that visit.
 */
export const DRIVER_QR_PREFIX = 'pullup://driver/';
const DRIVER_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function generateDriverQRContent(code: string): string {
  return `${DRIVER_QR_PREFIX}${code}`;
}

/** Accepts a scanned driver QR or a typed code; returns the normalized code or null. */
export function parseDriverCode(content: string): string | null {
  const raw = content.trim().toUpperCase();
  const code = raw.startsWith(DRIVER_QR_PREFIX.toUpperCase())
    ? raw.slice(DRIVER_QR_PREFIX.length)
    : raw.replace(/[\s-]/g, '');
  return DRIVER_CODE_PATTERN.test(code) ? code : null;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
