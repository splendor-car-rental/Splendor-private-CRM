import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { KycEngine } from '../src/server/kycEngine';
import { globalStore } from '../src/server/dataStore';

const source = readFileSync(new URL('../src/server/kycEngine.ts', import.meta.url), 'utf8');
const originalSecret = process.env.KYC_TOKEN_SECRET;
let originalCustomers: any[];

function acceptedDoc(customerId: string, category: string) {
  return {
    id: `${customerId}-${category}`,
    customerId,
    category,
    storagePath: `customer-documents/${customerId}/${category}.pdf`,
    fileUrl: `/api/kyc/${customerId}/documents/${category}`,
    fileName: `${category}.pdf`,
    documentNumberMasked: '****',
    expiryDate: '2030-12-31',
    issuingCountry: 'AE',
    status: 'ACCEPTED',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    verifiedBy: 'reviewer-1',
    verifiedByName: 'Reviewer One'
  } as any;
}

beforeEach(() => {
  originalCustomers = globalStore.customers;
  globalStore.customers = [];
  delete process.env.KYC_TOKEN_SECRET;
});

afterEach(() => {
  globalStore.customers = originalCustomers;
  if (originalSecret === undefined) delete process.env.KYC_TOKEN_SECRET;
  else process.env.KYC_TOKEN_SECRET = originalSecret;
});

describe('KYC evidence integrity', () => {
  it('never manufactures a date of birth or verified age for an unknown-age customer', () => {
    const customer = {
      id: 'CUS-KYC-UNKNOWN',
      fullName: 'Unknown Age',
      country: 'UAE',
      nationality: 'Resident',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z'
    } as any;

    const profile = KycEngine.getOrCreateKycProfile(customer);
    expect(profile.dateOfBirth).toBe('');
    expect(profile.age).toBe(0);
    expect(profile.isAgeVerified).toBe(false);
    expect(source).not.toContain("'1995-01-01'");
  });

  it('does not mark a complete document set VERIFIED when age evidence is absent', () => {
    const customerId = 'CUS-KYC-DOCS';
    const customer = {
      id: customerId,
      fullName: 'Docs Only',
      country: 'UAE',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      kycProfile: {
        customerId,
        customerCategory: 'UAE_RESIDENT',
        status: 'UNDER_REVIEW',
        dateOfBirth: '',
        age: 0,
        isAgeVerified: false,
        riskScore: 'LOW',
        documents: [
          acceptedDoc(customerId, 'EMIRATES_ID_FRONT'),
          acceptedDoc(customerId, 'EMIRATES_ID_BACK'),
          acceptedDoc(customerId, 'DRIVING_LICENSE_FRONT'),
          acceptedDoc(customerId, 'DRIVING_LICENSE_BACK')
        ],
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    } as any;

    KycEngine.reconcileProfileState(customer.kycProfile, customer);
    expect(customer.kycProfile.status).toBe('UNDER_REVIEW');
  });

  it('fails eligibility closed when age evidence is unknown even with accepted documents', () => {
    const customerId = 'CUS-KYC-ELIGIBILITY';
    const customer = {
      id: customerId,
      fullName: 'No DOB',
      country: 'UAE',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      kycProfile: {
        customerId,
        customerCategory: 'UAE_RESIDENT',
        status: 'UNDER_REVIEW',
        dateOfBirth: '',
        age: 0,
        isAgeVerified: false,
        riskScore: 'LOW',
        documents: [
          acceptedDoc(customerId, 'EMIRATES_ID_FRONT'),
          acceptedDoc(customerId, 'EMIRATES_ID_BACK'),
          acceptedDoc(customerId, 'DRIVING_LICENSE_FRONT'),
          acceptedDoc(customerId, 'DRIVING_LICENSE_BACK')
        ],
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    } as any;
    globalStore.customers = [customer];

    const result = KycEngine.evaluateCustomerKycEligibility(customerId, undefined, '2026-09-03T00:00:00.000Z');
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toContain('date of birth has not been verified');
  });

  it('has no source-code fallback signing secret and fails closed when KYC_TOKEN_SECRET is absent', () => {
    expect(source).not.toContain('splendor-luxury-kyc-secret-key');
    expect(source).toContain('crypto.timingSafeEqual');
    expect(() => KycEngine.generateIntakeToken('CUS-1')).toThrow('KYC token signing is not configured.');
    expect(KycEngine.verifyIntakeToken('anything')).toEqual({
      isValid: false,
      error: 'KYC intake verification is unavailable.'
    });
  });

  it('signs and verifies tokens only when the secret is supplied at operation time', () => {
    process.env.KYC_TOKEN_SECRET = 'test-only-kyc-secret-that-is-long-enough-1234567890';
    const issued = KycEngine.generateIntakeToken('CUS-SECURE', 1);
    expect(KycEngine.verifyIntakeToken(issued.token)).toEqual({ isValid: true, customerId: 'CUS-SECURE' });

    const decoded = Buffer.from(issued.token, 'base64url').toString('utf8');
    const [customerId, expiresAt, hmac] = decoded.split('|');
    const tampered = Buffer.from(`${customerId}-other|${expiresAt}|${hmac}`).toString('base64url');
    expect(KycEngine.verifyIntakeToken(tampered).isValid).toBe(false);
  });
});
