/**
 * Receipt storage helpers shared by web and mobile.
 *
 * Receipts live in the private `receipts` bucket at receipts/<claim_id>/<file>.
 * Claims store that path; older rows stored a public URL, so accept both.
 */

export const RECEIPTS_BUCKET = 'receipts';

export type ReceiptType = 'ride' | 'venue';

export function receiptObjectPath(claimId: string, fileName: string): string {
  return `receipts/${claimId}/${fileName}`;
}

/** Storage object path for a stored receipt value (path or legacy URL). */
export function receiptPathFromStored(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const match = stored.match(/\/object\/(?:public|sign)\/receipts\/([^?]+)/);
  if (match) return decodeURIComponent(match[1]);
  return stored.startsWith('http') ? null : stored;
}
