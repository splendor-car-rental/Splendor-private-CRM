import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const financeView = readFileSync(new URL('../src/components/views/FinanceLedgerView.tsx', import.meta.url), 'utf8');
const settingsView = readFileSync(new URL('../src/components/views/SettingsAuditView.tsx', import.meta.url), 'utf8');

describe('tax and credit governance claims', () => {
  it('does not present configured VAT calculations as professionally validated FTA compliance', () => {
    const uiText = `${financeView}\n${settingsView}`.toLowerCase();
    expect(uiText).not.toContain('uae vat compliance');
    expect(uiText).not.toContain('fta regulatory compliance');
    expect(uiText).not.toContain('تلتزم بلوائح الهيئة الاتحادية للضرائب');
    expect(settingsView).toContain('Filing readiness is assessed in Tax Compliance after source validation and professional review.');
  });

  it('does not offer corporate credit as a payment method', () => {
    expect(financeView).not.toContain('value="corporate_credit"');
    expect(financeView).not.toContain('Corporate Credit Account');
  });
});
