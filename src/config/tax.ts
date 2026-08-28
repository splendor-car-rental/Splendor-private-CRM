/**
 * Single source of truth for the VAT rate applied to rentals, quotations,
 * additional/return charges, and contract extensions across this app.
 *
 * Before this, the UAE's 5% VAT rate was a bare `0.05` / `1.05` literal
 * duplicated independently in 7+ places across both server.ts and the
 * frontend (quotation creation, contract creation, return-settlement
 * charges, contract extension, manual charges, and two frontend preview
 * calculators). If the rate ever needs to change, every single one of
 * those literals has to be found and updated in lockstep -- miss one and
 * quotations, contracts, and charges silently disagree on the total a
 * customer owes.
 *
 * This is a plain constant, not a runtime-configurable setting: UAE VAT
 * has been a flat, federally-set 5% since its 2018 introduction, and
 * changing it is a tax-policy event, not a business decision this app's
 * users should be able to toggle from a settings screen. If UAE VAT policy
 * ever changes, update this one value (and its test in
 * tests/vatCalculations.test.ts) rather than hunting down every call site
 * again.
 */
export const UAE_VAT_RATE = 0.05;

/** rentalTotal * (1 + UAE_VAT_RATE), i.e. rentalTotal + its VAT. */
export function applyVat(amount: number): number {
  return amount * (1 + UAE_VAT_RATE);
}

/** Just the VAT portion of `amount` (amount * UAE_VAT_RATE). */
export function vatPortion(amount: number): number {
  return amount * UAE_VAT_RATE;
}
