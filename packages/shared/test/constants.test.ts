import { describe, expect, it } from 'vitest';
import {
  calculateClaimCosts,
  generateDriverQRContent,
  generateQRContent,
  generateReferralCode,
  parseDriverCode,
  parseQRContent,
} from '../src/constants';

describe('calculateClaimCosts', () => {
  it('splits $10 into 50% ride credit, 20% driver bonus, 30% platform fee', () => {
    expect(calculateClaimCosts(10)).toEqual({
      ride_credit_amount: 5,
      driver_kickback_amount: 2,
      platform_fee_amount: 3,
    });
  });

  it('always adds up to exactly the cost per claim', () => {
    for (let cents = 1000; cents <= 10000; cents++) {
      const c = calculateClaimCosts(cents / 100);
      const sum = Math.round((c.ride_credit_amount + c.driver_kickback_amount + c.platform_fee_amount) * 100);
      expect(sum, `$${(cents / 100).toFixed(2)}`).toBe(cents);
    }
  });

  it('never makes a share negative', () => {
    const c = calculateClaimCosts(10.01);
    expect(Math.min(c.ride_credit_amount, c.driver_kickback_amount, c.platform_fee_amount)).toBeGreaterThan(0);
  });
});

describe('venue QR codes', () => {
  it('round-trips a venue id', () => {
    expect(parseQRContent(generateQRContent('abc-123'))).toBe('abc-123');
  });

  it('rejects other QR codes', () => {
    expect(parseQRContent('https://example.com')).toBeNull();
    expect(parseQRContent('pullup://venue/abc')).toBeNull();
    expect(parseQRContent('pullup://driver/ABCDEFGH')).toBeNull();
  });
});

describe('driver codes', () => {
  it('accepts a scanned driver QR', () => {
    expect(parseDriverCode(generateDriverQRContent('86YS23YR'))).toBe('86YS23YR');
  });

  it('accepts typed codes with spaces, dashes and lowercase', () => {
    expect(parseDriverCode(' 86ys-23yr ')).toBe('86YS23YR');
    expect(parseDriverCode('86YS 23YR')).toBe('86YS23YR');
  });

  it('rejects wrong lengths and look-alike characters', () => {
    expect(parseDriverCode('86YS23Y')).toBeNull();
    expect(parseDriverCode('86YS23YRX')).toBeNull();
    expect(parseDriverCode('O0I1O0I1')).toBeNull();
    expect(parseDriverCode('pullup://venue/abc/verify')).toBeNull();
  });

  it('generates codes that parse', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      expect(parseDriverCode(code)).toBe(code);
    }
  });
});
