import { describe, expect, it } from 'vitest';
import { receiptDeadline, receiptObjectPath, receiptPathFromStored } from '../src/receipts';

describe('receipt paths', () => {
  it('builds the storage path the upload policy expects (receipts/<claim>/<file>)', () => {
    expect(receiptObjectPath('claim-1', 'ride.jpg')).toBe('receipts/claim-1/ride.jpg');
  });

  it('passes stored paths through', () => {
    expect(receiptPathFromStored('receipts/claim-1/ride.jpg')).toBe('receipts/claim-1/ride.jpg');
  });

  it('extracts the path from legacy public and signed URLs', () => {
    expect(
      receiptPathFromStored('https://x.supabase.co/storage/v1/object/public/receipts/receipts/c1/a%20b.jpg')
    ).toBe('receipts/c1/a b.jpg');
    expect(
      receiptPathFromStored('https://x.supabase.co/storage/v1/object/sign/receipts/receipts/c1/r.jpg?token=abc')
    ).toBe('receipts/c1/r.jpg');
  });

  it('refuses URLs from anywhere else', () => {
    expect(receiptPathFromStored('https://evil.example/r.jpg')).toBeNull();
    expect(receiptPathFromStored(null)).toBeNull();
    expect(receiptPathFromStored('')).toBeNull();
  });
});

describe('receiptDeadline', () => {
  it('defaults to 7 days after check-in', () => {
    expect(receiptDeadline('2026-01-01T12:00:00Z').toISOString()).toBe('2026-01-08T12:00:00.000Z');
  });

  it('uses an extended deadline when staff set one', () => {
    expect(receiptDeadline('2026-01-01T12:00:00Z', '2026-01-20T00:00:00Z').toISOString()).toBe(
      '2026-01-20T00:00:00.000Z'
    );
  });
});
