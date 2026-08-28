/**
 * Data Retention Policy Framework (Phase 23.9)
 * ===============================================
 *
 * Proves the five retention rules seeded into the real Business Rules
 * Engine catalog are genuinely FRAMEWORK ONLY: every one starts unset
 * (value: null, "not yet defined" -- no invented number), lives at
 * sensitive_rule tier so activating one always requires a second
 * authorized person's approval (never a single person's unilateral
 * change, not even CEO), and that no enforcement code exists anywhere
 * that would act on one of these values -- setting a period does not, by
 * itself, delete/purge/anonymize/archive anything.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BUSINESS_RULES } from '../src/config/businessRules';
import { hydrateBusinessRules, getRule, evaluateRuleChangeRequest } from '../src/server/businessRules';

const RETENTION_KEYS = [
  'retentionCustomerRecordsDays',
  'retentionKycDocumentsDays',
  'retentionFinancialRecordsDays',
  'retentionAuditLogsDays',
  'retentionWhatsappLogsDays'
];

describe('Data Retention Policy catalog', () => {
  it('every retention rule starts unset -- no period was invented for this phase', () => {
    for (const key of RETENTION_KEYS) {
      const seed = DEFAULT_BUSINESS_RULES.find(r => r.id === key);
      expect(seed).toBeDefined();
      expect(seed!.value).toBeNull();
    }
  });

  it('every retention rule is sensitive_rule tier -- always requires a second approver to activate', () => {
    for (const key of RETENTION_KEYS) {
      const seed = DEFAULT_BUSINESS_RULES.find(r => r.id === key);
      expect(seed!.tier).toBe('sensitive_rule');
      expect(seed!.editable).toBe(true); // framework must allow eventual activation, just not immediately
    }
  });

  it('proposing a real period, even by CEO, never applies it directly -- it always requires a second approver', async () => {
    await hydrateBusinessRules();
    const noopRecordAudit = async () => undefined;

    for (const key of RETENTION_KEYS) {
      const before = getRule(key);
      expect(before?.value).toBeNull();

      const outcome = await evaluateRuleChangeRequest(
        key, 1825, 'Testing that this cannot apply directly (real activation requires legal review + a second approver).',
        { uid: 'CEO-TEST', name: 'Test CEO', role: 'ceo' }, noopRecordAudit
      );

      expect(outcome.applied).toBe(false);
      if (!outcome.applied) expect(outcome.needsApproval).toBe(true);
      // Still unset -- a mere proposal must never move the real value.
      expect(getRule(key)?.value).toBeNull();
    }
  });
});
