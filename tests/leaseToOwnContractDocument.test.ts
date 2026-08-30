/**
 * Lease-to-Own contract document generation (src/server/leaseToOwnContractDocument.ts)
 * ===========================================================================
 *
 * buildLtoContractHtml() is pure -- tested with plain assertions. The
 * render itself launches a REAL headless Chromium (puppeteer-core +
 * @sparticuz/chromium, the same production rendering path) and produces a
 * real PDF -- not mocked, since this is exactly the component whose
 * correctness (Arabic shaping/RTL, letterhead fidelity) was the whole
 * reason a pure pdf-lib approach was rejected. Verified structurally here
 * (magic bytes, page count, Latin/date substrings extracted via
 * pdf-parse); the actual visual fidelity (correct Arabic joining, the
 * unmodified letterhead) was separately confirmed by rendering to PNG and
 * visually reviewing it during development.
 *
 * generateLtoContractDocument()'s Firebase Storage upload step is NOT
 * exercised here -- this repo has no working Firebase Storage emulator in
 * this environment (the same pre-existing limitation noted for every
 * other document-upload code path in this codebase); its guard clauses
 * (contract not found / not an LTO agreement / customer not found), which
 * run before any Storage call, are tested directly against globalStore.
 */

import { afterEach, describe, expect, it } from 'vitest';
import pdfParse from 'pdf-parse';
import { buildLtoContractHtml, renderLtoContractPdf, generateLtoContractDocument } from '../src/server/leaseToOwnContractDocument';
import { LtoError } from '../src/server/leaseToOwn';
import { globalStore } from '../src/server/dataStore';
import type { Contract, Customer, LtoInstallment } from '../src/types';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'CUST-DOC-1', type: 'individual', fullName: 'أحمد سالم الفلاسي', email: 'a@test.ae', phone: '+971501234567',
    address: 'Dubai Marina', city: 'Dubai', country: 'UAE', nationality: 'إماراتي',
    idType: 'emirates_id', idNumber: '784-1990-1234567-1', idExpiryDate: '2030-01-01',
    licenseNumber: 'DXB-LIC-9911', licenseCountry: 'UAE', licenseExpiryDate: '2030-01-01',
    source: 'showroom', ownerId: 'U1', ownerName: 'Test', status: 'active', isVIP: false, tags: [],
    ...overrides
  } as unknown as Customer;
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'CON-DOC-1', contractNumber: 'CON-DOC-1', customerId: 'CUST-DOC-1', customerName: 'أحمد سالم الفلاسي',
    customerPhone: '+971501234567', customerAddress: 'Dubai Marina', vehicleId: 'VEH-DOC-1', vehicleName: 'Rolls-Royce Ghost 2025',
    vehiclePlate: 'A 12345 Dubai', vehicleVin: 'VINTEST0001', startDateTime: '2026-09-01T00:00:00.000Z', endDateTime: '2028-09-01T00:00:00.000Z',
    pickupLocation: 'Showroom', returnLocation: 'Showroom', dailyRate: 0, rentalTotal: 246000, vatAmount: 500,
    grandTotal: 246500, depositAmount: 0, mileageAllowancePerDay: 0, extraKmRate: 0, depositReleaseDays: 0,
    status: 'active', paymentStatus: 'unpaid', depositStatus: 'pending', termsAccepted: true,
    createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z',
    contractType: 'lease_to_own',
    lto: {
      applicationId: 'LTOA-000001', termMonths: 24, downPayment: 30000, monthlyInstallment: 9000,
      finalPayment: 0, vehiclePrice: 246000, processingFee: 1000, vatAmount: 50, totalContractValue: 246500,
      paidAmount: 0, outstandingAmount: 246500, ltoStatus: 'active'
    },
    ...overrides
  } as unknown as Contract;
}

function makeInstallments(contractId: string): LtoInstallment[] {
  return [
    { id: 'i0', contractId, customerId: 'CUST-DOC-1', customerName: 'Test', installmentNumber: 0, isFinalPayment: false, dueDate: '2026-09-01T00:00:00.000Z', amount: 30000, principalPortion: 30000, markupPortion: 0, paidAmount: 0, remainingAmount: 30000, status: 'due', createdAt: '', updatedAt: '' },
    { id: 'i1', contractId, customerId: 'CUST-DOC-1', customerName: 'Test', installmentNumber: 1, isFinalPayment: false, dueDate: '2026-10-01T00:00:00.000Z', amount: 9000, principalPortion: 9000, markupPortion: 0, paidAmount: 0, remainingAmount: 9000, status: 'upcoming', createdAt: '', updatedAt: '' }
  ] as unknown as LtoInstallment[];
}

describe('buildLtoContractHtml', () => {
  it('merges real contract/customer/installment data into the Arabic clause template', () => {
    const contract = makeContract();
    const customer = makeCustomer();
    const html = buildLtoContractHtml(contract, customer, makeInstallments(contract.id));

    expect(html).toContain('dir="rtl"');
    expect(html).toContain(customer.fullName);
    expect(html).toContain(contract.vehicleName);
    expect(html).toContain(contract.vehiclePlate!);
    expect(html).toContain(contract.vehicleVin!);
    expect(html).toContain('246,500.00');
    expect(html).toContain('30,000.00');
    expect(html).toContain('9,000.00');
    expect(html).toContain(customer.idNumber);
    for (const heading of ['البند الأول', 'البند الثاني', 'البند الثالث', 'البند الرابع', 'البند الخامس', 'البند السادس', 'البند السابع', 'البند الثامن', 'البند التاسع']) {
      expect(html).toContain(heading);
    }
  });

  it('throws for a contract with no lto details', () => {
    const contract = makeContract({ contractType: undefined, lto: undefined });
    expect(() => buildLtoContractHtml(contract, makeCustomer(), [])).toThrow(LtoError);
  });
});

describe('renderLtoContractPdf (real headless Chromium)', () => {
  it('produces a real, valid, multi-line PDF with the letterhead and merged data', async () => {
    const contract = makeContract();
    const customer = makeCustomer();
    const pdf = await renderLtoContractPdf(contract, customer, makeInstallments(contract.id));

    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(50_000);

    const parsed = await pdfParse(pdf);
    expect(parsed.numpages).toBeGreaterThanOrEqual(2);
    expect(parsed.text).toContain('VINTEST0001');
    expect(parsed.text).toContain('2026');
  }, 30_000);
});

describe('generateLtoContractDocument guard clauses (no Storage access needed)', () => {
  afterEach(() => {
    globalStore.contracts.length = 0;
    globalStore.customers.length = 0;
  });

  it('rejects an unknown contract id', async () => {
    await expect(generateLtoContractDocument('NOPE', { uid: 'u', name: 'n', role: 'ceo' }, async () => ({} as any)))
      .rejects.toBeInstanceOf(LtoError);
  });

  it('rejects a non-Lease-to-Own contract', async () => {
    globalStore.contracts.push(makeContract({ contractType: undefined, lto: undefined }));
    await expect(generateLtoContractDocument('CON-DOC-1', { uid: 'u', name: 'n', role: 'ceo' }, async () => ({} as any)))
      .rejects.toBeInstanceOf(LtoError);
  });

  it('rejects when the linked customer record is missing', async () => {
    globalStore.contracts.push(makeContract());
    await expect(generateLtoContractDocument('CON-DOC-1', { uid: 'u', name: 'n', role: 'ceo' }, async () => ({} as any)))
      .rejects.toBeInstanceOf(LtoError);
  });
});
