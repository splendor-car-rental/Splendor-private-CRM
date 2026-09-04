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

/** netAmount * (1 + UAE_VAT_RATE), i.e. a net amount plus the VAT due on it. */
export function applyVat(netAmount: number): number {
  return netAmount * (1 + UAE_VAT_RATE);
}

/**
 * The VAT due on a NET (VAT-exclusive) amount: netAmount * UAE_VAT_RATE.
 * Never call this with a figure that already includes VAT (a stored
 * `totalAmount`/`grandTotal`) -- that silently overstates the VAT portion
 * and understates the net revenue it was split from. Use
 * extractVatFromGross() for that case instead. (This function used to be
 * named the ambiguous `vatPortion`, which said nothing about which side of
 * the VAT line its argument was supposed to be on -- exactly how the one
 * real bug below went unnoticed: see extractVatFromGross's own comment.)
 */
export function calculateVatOnNet(netAmount: number): number {
  return netAmount * UAE_VAT_RATE;
}

/**
 * The VAT portion already embedded in a GROSS (VAT-inclusive) amount --
 * gross * rate/(1+rate), the correct way to back VAT out of a total that
 * already includes it. `gross * rate` (i.e. calculateVatOnNet(gross)) is
 * NOT the same number and must never be used here: for a 1050 AED gross
 * total (1000 net + 50 VAT), calculateVatOnNet(1050) wrongly yields 52.5,
 * not 50 -- overstating VAT collected and understating net revenue by the
 * same 2.5 AED. This was exactly the bug in the reservation-to-contract
 * conversion route before this fix (server.ts): it called the net-VAT
 * formula on a reservation's VAT-inclusive totalAmount.
 */
export function extractVatFromGross(grossAmount: number): number {
  return grossAmount * (UAE_VAT_RATE / (1 + UAE_VAT_RATE));
}
