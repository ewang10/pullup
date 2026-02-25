export const DEFAULT_HOLD_DURATION_MINUTES = 120;
export const DEFAULT_SEARCH_RADIUS_MILES = 10;
export const METERS_PER_MILE = 1609.34;

export const VENUE_CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar' },
  { value: 'nightclub', label: 'Nightclub' },
  { value: 'attraction', label: 'Attraction' },
  { value: 'experience', label: 'Experience' },
  { value: 'dispensary', label: 'Dispensary' },
  { value: 'other', label: 'Other' },
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

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
