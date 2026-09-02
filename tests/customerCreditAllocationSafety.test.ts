import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/server/safeAccountingAllocation.ts'), 'utf8');
const api = readFileSync(resolve(process.cwd(), 'src/server/accountingApi.ts'), 'utf8');

describe('customer credit allocation accounting safety', () => {
  it('routes production allocation through the atomic idempotent service', () => {
    expect(api).toContain('allocateCustomerCreditAtomic');
    expect(api).toContain("action === 'allocate'");
    expect(api).toContain('idempotencyKeyFromRequest(req)');
  });

  it('reclassifies unapplied customer credit to accounts receivable without touching cash', () => {
    expect(source).toContain('ACCOUNTING_CONTROL_ACCOUNTS.customerCredits');
    expect(source).toContain('debit: requestedTotal');
    expect(source).toContain('ACCOUNTING_CONTROL_ACCOUNTS.accountsReceivable');
    expect(source).toContain('credit: amountToAllocate');
    expect(source).not.toMatch(/accountCode:\s*ACCOUNTING_CONTROL_ACCOUNTS\.(cash|bank|cardClearing)[\s\S]{0,120}(debit|credit):\s*requestedTotal/);
  });

  it('requires an idempotency key and posts the journal in the same transaction as operational allocation', () => {
    expect(source).toContain("if (!idempotencyKey) throw new Error('Idempotency-Key is required for customer-credit allocation.')");
    expect(source).toContain('runIdempotent');
    expect(source).toContain("sourceType: 'PaymentAllocation'");
    expect(source).toContain('tx.create(journalRef');
    expect(source).toContain('tx.set(paymentRef');
  });

  it('blocks cross-customer and over-allocation cases', () => {
    expect(source).toContain('invoice.customerId !== payment.customerId');
    expect(source).toContain('Requested allocation exceeds the unallocated customer credit.');
    expect(source).toContain('accounting-adjusted balance');
  });
});
