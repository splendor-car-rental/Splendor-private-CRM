/**
 * Anomaly Detection (Phase 23.6)
 * ================================
 *
 * Proves the pattern-level detection logic in src/server/anomalyDetection.ts
 * against synthetic audit log fixtures -- no Firestore or Express
 * involved, since detectAnomalies() is a pure function over an AuditLog[]
 * plus the (unhydrated, so default-valued) Business Rules Engine cache.
 * Confirms both that each pattern DOES trigger when the threshold is met,
 * and that it does NOT trigger just below the threshold -- a detector that
 * always fires is as useless as one that never does.
 */

import { describe, expect, it } from 'vitest';
import { detectAnomalies } from '../src/server/anomalyDetection';
import type { AuditLog } from '../src/types';

let seq = 0;
function log(overrides: Partial<AuditLog> & { timestamp: string }): AuditLog {
  seq += 1;
  return {
    id: `AUD-${String(seq).padStart(6, '0')}`,
    userId: 'USR-001',
    userName: 'Test User',
    userRole: 'finance',
    entityType: 'Charge',
    entityId: 'CHG-000001',
    action: 'create',
    ...overrides
  };
}

const BASE = new Date('2026-06-15T10:00:00.000Z'); // a UTC time whose +4 (GST) is 14:00 -- comfortably inside business hours
function at(minutesFromBase: number): string {
  return new Date(BASE.getTime() + minutesFromBase * 60000).toISOString();
}

describe('detectAnomalies -- high-frequency actor', () => {
  it('flags 5 sensitive actions by the same actor within 1 hour', () => {
    const logs: AuditLog[] = Array.from({ length: 5 }, (_, i) =>
      log({ timestamp: at(i * 10), action: 'refund', entityType: 'Deposit', entityId: `DEP-00000${i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'high_frequency_actor')).toBe(true);
  });

  it('does NOT flag 4 sensitive actions within the same window (below the default threshold of 5)', () => {
    const logs: AuditLog[] = Array.from({ length: 4 }, (_, i) =>
      log({ timestamp: at(i * 10), action: 'refund', entityType: 'Deposit', entityId: `DEP-00000${i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'high_frequency_actor')).toBe(false);
  });

  it('does NOT flag 5 sensitive actions spread across more than the 1-hour window', () => {
    const logs: AuditLog[] = Array.from({ length: 5 }, (_, i) =>
      log({ timestamp: at(i * 30), action: 'refund', entityType: 'Deposit', entityId: `DEP-00000${i}` }) // 30 min apart -> spans 2 hours
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'high_frequency_actor')).toBe(false);
  });

  it('does NOT flag ordinary, non-sensitive activity regardless of volume', () => {
    const logs: AuditLog[] = Array.from({ length: 20 }, (_, i) =>
      log({ timestamp: at(i), action: 'create', entityType: 'Lead', entityId: `LEAD-0000${i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags).toHaveLength(0);
  });
});

describe('detectAnomalies -- repeated entity override', () => {
  it('flags the same record changed 3 times within 1 hour', () => {
    const logs: AuditLog[] = Array.from({ length: 3 }, (_, i) =>
      log({ timestamp: at(i * 15), action: 'update', entityType: 'Vehicle', entityId: 'VEH-0001', userId: `USR-00${i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'repeated_entity_override')).toBe(true);
  });

  it('does NOT flag 2 changes to the same record', () => {
    const logs: AuditLog[] = Array.from({ length: 2 }, (_, i) =>
      log({ timestamp: at(i * 15), action: 'update', entityType: 'Vehicle', entityId: 'VEH-0001' })
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'repeated_entity_override')).toBe(false);
  });
});

describe('detectAnomalies -- frequent customer merge', () => {
  it('flags the same actor merging 3 customers within 24 hours', () => {
    const logs: AuditLog[] = Array.from({ length: 3 }, (_, i) =>
      log({ timestamp: at(i * 60), action: 'merge', entityType: 'Customer', entityId: `CUS-00000${i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'frequent_customer_merge')).toBe(true);
  });

  it('does NOT flag 2 merges', () => {
    const logs: AuditLog[] = Array.from({ length: 2 }, (_, i) =>
      log({ timestamp: at(i * 60), action: 'merge', entityType: 'Customer', entityId: `CUS-00000${i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'frequent_customer_merge')).toBe(false);
  });
});

describe('detectAnomalies -- off-hours sensitive action', () => {
  it('flags a sensitive action at 2am Gulf Standard Time (UTC 22:00)', () => {
    const logs: AuditLog[] = [log({ timestamp: '2026-06-15T22:00:00.000Z', action: 'refund', entityType: 'Deposit', entityId: 'DEP-000009' })];
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'off_hours_sensitive_action')).toBe(true);
  });

  it('does NOT flag the same action type at 2pm Gulf Standard Time (UTC 10:00)', () => {
    const logs: AuditLog[] = [log({ timestamp: at(0), action: 'refund', entityType: 'Deposit', entityId: 'DEP-000009' })];
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'off_hours_sensitive_action')).toBe(false);
  });

  it('does NOT flag a non-sensitive action even at 2am GST', () => {
    const logs: AuditLog[] = [log({ timestamp: '2026-06-15T22:00:00.000Z', action: 'create', entityType: 'Lead', entityId: 'LEAD-00001' })];
    const flags = detectAnomalies(logs);
    expect(flags).toHaveLength(0);
  });
});

describe('detectAnomalies -- Splendor Procurement Phase 1 coverage', () => {
  it('flags high-frequency PurchaseOrder approvals by the same actor within 1 hour', () => {
    const logs: AuditLog[] = Array.from({ length: 5 }, (_, i) =>
      log({ timestamp: at(i * 10), action: 'approval', entityType: 'PurchaseOrder', entityId: `PO-SCR-${100 + i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'high_frequency_actor')).toBe(true);
  });

  it('flags an off-hours Debt approval (a procurement entity type, not just the original Charge/Deposit/BankImportBatch set)', () => {
    const logs: AuditLog[] = [log({ timestamp: '2026-06-15T22:00:00.000Z', action: 'approval', entityType: 'Debt', entityId: 'DBT-000001' })];
    const flags = detectAnomalies(logs);
    expect(flags.some(f => f.type === 'off_hours_sensitive_action')).toBe(true);
  });

  it('does NOT flag ordinary daytime procurement activity below the frequency threshold', () => {
    const logs: AuditLog[] = Array.from({ length: 2 }, (_, i) =>
      log({ timestamp: at(i * 10), action: 'approval', entityType: 'SupplierInvoice', entityId: `SINV-00000${i}` })
    );
    const flags = detectAnomalies(logs);
    expect(flags).toHaveLength(0);
  });
});

describe('detectAnomalies -- every flag carries its evidence', () => {
  it('every flag names the supporting audit log ids, never a bare accusation', () => {
    const logs: AuditLog[] = Array.from({ length: 5 }, (_, i) =>
      log({ timestamp: at(i * 10), action: 'refund', entityType: 'Deposit', entityId: `DEP-00000${i}` })
    );
    const flags = detectAnomalies(logs);
    for (const f of flags) {
      expect(f.supportingAuditLogIds.length).toBeGreaterThan(0);
      expect(f.summary).toBeTruthy();
      expect(f.summaryAr).toBeTruthy();
    }
  });
});
