import type { TaxOfficialSource, TaxRuleVersion } from '../tax/types';
import { validateOfficialSourceAuthority, validateProfessionalValidation } from './taxCompliancePolicy';

export interface InvoiceTaxLineEvidence {
  lineIndex: number;
  taxClassification: string;
  taxRuleVersionId: string;
  vatRate: number;
  vatAmount: number;
}

export interface InvoiceTaxEvidenceValidation {
  error: string | null;
  lineEvidence: InvoiceTaxLineEvidence[];
}

function finiteNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function dateOnly(value: unknown): string {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

/**
 * Fail-closed validation for issuing a tax invoice from an existing invoice
 * record. This validator deliberately does NOT choose a VAT rate or tax
 * classification. Every line must carry its own stored classification,
 * exact accepted rule-version id, rate and VAT amount. The accepted rule and
 * its still-current official-source evidence must cover the supply date.
 */
export function validateInvoiceTaxEvidence(
  invoice: any,
  rules: TaxRuleVersion[],
  sources: TaxOfficialSource[]
): InvoiceTaxEvidenceValidation {
  const supplyDate = dateOnly(invoice?.supplyDate || invoice?.issueDate);
  if (!supplyDate) return { error: 'Tax invoice issuance requires a valid authoritative supply date.', lineEvidence: [] };

  const subtotal = finiteNumber(invoice?.subtotal);
  const invoiceVat = finiteNumber(invoice?.vatAmount);
  const total = finiteNumber(invoice?.totalAmount);
  if (subtotal === null || invoiceVat === null || total === null) {
    return { error: 'Tax invoice issuance requires authoritative subtotal, VAT amount, and total amount fields.', lineEvidence: [] };
  }

  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  if (items.length === 0) return { error: 'Tax invoice issuance requires at least one authoritative invoice line.', lineEvidence: [] };

  const ruleById = new Map(rules.map(rule => [rule.id, rule]));
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const lineEvidence: InvoiceTaxLineEvidence[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const line = items[index] || {};
    const taxClassification = String(line.taxClassification || '').trim();
    const taxRuleVersionId = String(line.taxRuleVersionId || '').trim();
    const vatRate = finiteNumber(line.vatRate);
    const vatAmount = finiteNumber(line.vatAmount);
    const label = `Invoice line ${index + 1}`;

    if (!taxClassification) return { error: `${label} is missing authoritative tax classification metadata.`, lineEvidence: [] };
    if (!taxRuleVersionId) return { error: `${label} is missing an accepted tax rule version id.`, lineEvidence: [] };
    if (vatRate === null || vatRate < 0) return { error: `${label} is missing a valid authoritative VAT rate.`, lineEvidence: [] };
    if (vatAmount === null || vatAmount < 0) return { error: `${label} is missing a valid authoritative VAT amount.`, lineEvidence: [] };

    const rule = ruleById.get(taxRuleVersionId);
    if (!rule) return { error: `${label} references a tax rule version that does not exist.`, lineEvidence: [] };
    if (rule.status !== 'accepted') return { error: `${label} references a tax rule version that is not currently accepted.`, lineEvidence: [] };
    if (rule.domain !== 'VAT') return { error: `${label} must reference an accepted VAT rule version.`, lineEvidence: [] };
    if (rule.effectiveFrom.slice(0, 10) > supplyDate || (rule.effectiveTo && rule.effectiveTo.slice(0, 10) < supplyDate)) {
      return { error: `${label} references a VAT rule version outside its recorded effective period.`, lineEvidence: [] };
    }
    const professionalError = validateProfessionalValidation(rule.professionalValidation);
    if (professionalError) return { error: `${label} references a VAT rule without valid professional-validation evidence: ${professionalError}`, lineEvidence: [] };
    if (!Array.isArray(rule.sourceIds) || rule.sourceIds.length === 0) {
      return { error: `${label} references a VAT rule without official-source evidence.`, lineEvidence: [] };
    }
    for (const sourceId of rule.sourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) return { error: `${label} references missing official source ${sourceId}.`, lineEvidence: [] };
      if (!['validated', 'accepted'].includes(source.status)) {
        return { error: `${label} references retired or unvalidated official source ${sourceId}.`, lineEvidence: [] };
      }
      const authorityError = validateOfficialSourceAuthority(source.authority, source.officialUrl);
      if (authorityError) return { error: `${label} official source ${sourceId}: ${authorityError}`, lineEvidence: [] };
      if (source.effectiveFrom && source.effectiveFrom.slice(0, 10) > supplyDate) {
        return { error: `${label} official source ${sourceId} is not effective on the recorded supply date.`, lineEvidence: [] };
      }
      if (source.effectiveTo && source.effectiveTo.slice(0, 10) < supplyDate) {
        return { error: `${label} official source ${sourceId} is retired for the recorded supply date.`, lineEvidence: [] };
      }
    }

    lineEvidence.push({ lineIndex: index, taxClassification, taxRuleVersionId, vatRate, vatAmount });
  }

  return { error: null, lineEvidence };
}
