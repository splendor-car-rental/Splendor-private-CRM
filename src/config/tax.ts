/**
 * Legacy configured VAT rate used by operational calculations.
 *
 * IMPORTANT: this constant is not itself regulatory evidence and must not be
 * interpreted as making the Tax Compliance workspace filing-ready. Tax rule
 * governance, effective dates, official-source evidence and professional
 * validation remain separate controls.
 */
export const UAE_VAT_RATE = 0.05;

function finiteAmount(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error('VAT calculation requires a finite amount.');
  return amount;
}

/** Adds configured VAT to a NET amount. */
export function applyVat(netAmount: number): number {
  const amount = finiteAmount(netAmount);
  return amount * (1 + UAE_VAT_RATE);
}

/** VAT calculated ON TOP OF a NET amount. Never use this to extract VAT from a VAT-inclusive gross amount. */
export function vatPortion(netAmount: number): number {
  return finiteAmount(netAmount) * UAE_VAT_RATE;
}

/** Extracts the VAT component already INCLUDED in a gross/VAT-inclusive amount. */
export function extractVatFromGross(grossAmount: number): number {
  const amount = finiteAmount(grossAmount);
  return amount * UAE_VAT_RATE / (1 + UAE_VAT_RATE);
}

/** Returns the net amount represented by a VAT-inclusive gross amount. */
export function netFromGross(grossAmount: number): number {
  const amount = finiteAmount(grossAmount);
  return amount - extractVatFromGross(amount);
}
