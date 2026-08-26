import { TollType, TollSource, FinancialSummary, TollPricingConfig } from '../types';

/**
 * Splendor's default pricing rules for tolls & parking, confirmed with the
 * business owner. These are DEFAULTS only -- the business owner asked that
 * these rates be editable (rates rise/fall over time), so the live values
 * actually used come from globalStore.tollPricingConfig (see server.ts /
 * dataStore.ts), which starts out equal to this object and can be edited by
 * CEO/Admin/Finance/Sales via PATCH /api/toll-pricing-config. Kept here as
 * named constants purely as the fallback/seed values.
 */
export const DEFAULT_TOLL_PRICING: TollPricingConfig = {
  id: 'default',
  /** Salik: cost to the company is whatever Salik actually charged (variable,
   *  peak/off-peak/free, already VAT-inclusive on the statement). The
   *  customer is billed a flat rate per transaction by default. */
  salikCustomerRate: 7.5,
  /** Darb: the company's cost is a fixed base rate (VAT excluded), and the
   *  customer is billed a fixed rate (VAT included) by default -- Darb's own
   *  per-crossing cost to the company does not fluctuate the way Salik's
   *  does, but both figures can still be edited/overridden. */
  darbCompanyCost: 4.0,
  darbCustomerRate: 6.0,
  /** Parking: the base amount is whatever staff enters (no fixed provider
   *  rate), marked up by a flat percentage as the service fee by default. */
  parkingMarkupPercent: 10
};

export interface CalculateTollInput {
  type: TollType;
  date: string;
  time?: string;
  locationName?: string;
  direction?: string;
  tagNumber?: string;
  plateNumber?: string;
  transactionRef?: string;
  isPeakTime?: boolean;
  /** Salik: the real cost Salik charged the company for this trip (VAT-inclusive), read from the statement or typed manually.
   *  Darb: normally defaults to the fixed company cost, but can be manually overridden if the actual cost changes. */
  actualCompanyCost?: number;
  /** Manual override of the flat customer-facing rate for this one transaction (Admin/Finance/Sales only --
   *  enforced by the caller/server, not by this pure function). Falls back to the current default rate for the type. */
  customerBillingRateOverride?: number;
  /** Flat AED discount taken off the customer billing rate for this transaction (Admin/Finance/Sales only). */
  discountAmount?: number;
  /** Percent discount taken off the customer billing rate for this transaction (Admin/Finance/Sales only). Applied before discountAmount. */
  discountPercent?: number;
  /** Parking only: the base amount before the markup. */
  parkingBaseAmount?: number;
  contractId?: string;
  reservationId?: string;
  customerId?: string;
  customerName?: string;
  vehicleId?: string;
  source?: TollSource;
  createdBy: string;
}

export type CalculatedToll = Omit<TollTransactionDraft, 'id'>;

// Local alias so this file doesn't need to import the full TollTransaction
// shape just to describe its own return type.
interface TollTransactionDraft {
  id?: string;
  type: TollType;
  date: string;
  time?: string;
  locationName: string;
  direction?: string;
  tagNumber?: string;
  plateNumber?: string;
  transactionRef?: string;
  isPeakTime?: boolean;
  actualCompanyCost: number;
  customerBillingRate: number;
  totalChargedToCustomer: number;
  netProfit: number;
  parkingBaseAmount?: number;
  vehicleId?: string;
  contractId?: string;
  reservationId?: string;
  customerId?: string;
  customerName?: string;
  isPaid: boolean;
  discountAmount?: number;
  discountPercent?: number;
  rateOverridden?: boolean;
  source: TollSource;
  createdBy: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Computes the actual-cost / customer-billing / net-profit fields for a
 * single Salik, Darb, or Parking transaction. Used identically for manual
 * entries and for every row produced by a file import, so the math is
 * defined in one place only.
 *
 * `pricing` is the live default-rate config (pass globalStore.tollPricingConfig
 * on the server, or DEFAULT_TOLL_PRICING if none has been saved yet). Any of
 * `actualCompanyCost` / `customerBillingRateOverride` / `discountAmount` /
 * `discountPercent` on `data` overrides the default for that one transaction
 * -- callers are responsible for only allowing those fields through for
 * Admin/Finance/Sales/CEO (see TOLL_PRICING_EDIT_ROLES in
 * src/config/permissions.ts and the requireTollPricingEdit check in server.ts).
 */
export function calculateTollTransaction(data: CalculateTollInput, pricing: TollPricingConfig = DEFAULT_TOLL_PRICING): CalculatedToll {
  let actualCompanyCost = 0;
  let customerBillingRate = 0;
  let rateOverridden = false;

  if (data.type === 'salik') {
    // Variable real cost to the company (0 AED off-peak/free legs are common);
    // the customer is billed the default flat rate unless overridden.
    actualCompanyCost = data.actualCompanyCost ?? 0;
    customerBillingRate = data.customerBillingRateOverride ?? pricing.salikCustomerRate;
    if (data.customerBillingRateOverride != null && data.customerBillingRateOverride !== pricing.salikCustomerRate) rateOverridden = true;
  } else if (data.type === 'darb') {
    // Fixed base cost/billed rate by default, but both can be manually
    // re-entered per transaction if the real figures differ.
    actualCompanyCost = data.actualCompanyCost ?? pricing.darbCompanyCost;
    customerBillingRate = data.customerBillingRateOverride ?? pricing.darbCustomerRate;
    if ((data.actualCompanyCost != null && data.actualCompanyCost !== pricing.darbCompanyCost) ||
        (data.customerBillingRateOverride != null && data.customerBillingRateOverride !== pricing.darbCustomerRate)) rateOverridden = true;
  } else {
    // Parking: base amount entered by staff, marked up by the default
    // percentage unless a specific billing rate is entered instead.
    const base = data.parkingBaseAmount ?? 0;
    actualCompanyCost = base;
    const computed = round2(base * (1 + pricing.parkingMarkupPercent / 100));
    customerBillingRate = data.customerBillingRateOverride ?? computed;
    if (data.customerBillingRateOverride != null && data.customerBillingRateOverride !== computed) rateOverridden = true;
  }

  // Discounts apply to what's actually collected, not to the headline rate --
  // percent first, then a flat amount, matching how a manual discount is
  // usually explained to a customer.
  let totalChargedToCustomer = customerBillingRate;
  if (data.discountPercent) {
    totalChargedToCustomer = totalChargedToCustomer * (1 - data.discountPercent / 100);
  }
  if (data.discountAmount) {
    totalChargedToCustomer = totalChargedToCustomer - data.discountAmount;
  }
  totalChargedToCustomer = Math.max(0, round2(totalChargedToCustomer));

  const netProfit = round2(totalChargedToCustomer - actualCompanyCost);

  return {
    type: data.type,
    date: data.date,
    time: data.time,
    locationName: data.locationName || (data.type === 'parking' ? 'General Parking' : 'Unknown Gate'),
    direction: data.direction,
    tagNumber: data.tagNumber,
    plateNumber: data.plateNumber,
    transactionRef: data.transactionRef,
    isPeakTime: data.isPeakTime,
    actualCompanyCost: round2(actualCompanyCost),
    customerBillingRate: round2(customerBillingRate),
    totalChargedToCustomer,
    netProfit,
    parkingBaseAmount: data.type === 'parking' ? round2(data.parkingBaseAmount ?? 0) : undefined,
    vehicleId: data.vehicleId,
    contractId: data.contractId,
    reservationId: data.reservationId,
    customerId: data.customerId,
    customerName: data.customerName,
    isPaid: false,
    discountAmount: data.discountAmount,
    discountPercent: data.discountPercent,
    rateOverridden: rateOverridden || undefined,
    source: data.source || 'manual',
    createdBy: data.createdBy
  };
}

/**
 * Financial roll-up used by the Tolls & Parking dashboard: cost vs.
 * customer collections vs. net profit, independently per type and overall.
 * This is the "top-up expenses vs. customer collections" summary view.
 */
export function analyzeTollsFinancials(transactions: Array<{ type: TollType; actualCompanyCost: number; totalChargedToCustomer: number; netProfit: number }>) {
  const summarize = (items: typeof transactions): FinancialSummary => {
    const totalCost = items.reduce((acc, t) => acc + t.actualCompanyCost, 0);
    const totalCollected = items.reduce((acc, t) => acc + t.totalChargedToCustomer, 0);
    const totalNetProfit = items.reduce((acc, t) => acc + t.netProfit, 0);
    return {
      totalCost: round2(totalCost),
      totalCollected: round2(totalCollected),
      totalNetProfit: round2(totalNetProfit),
      count: items.length
    };
  };

  const salik = summarize(transactions.filter(t => t.type === 'salik'));
  const darb = summarize(transactions.filter(t => t.type === 'darb'));
  const parking = summarize(transactions.filter(t => t.type === 'parking'));

  return {
    salik,
    darb,
    parking,
    overall: {
      totalCost: round2(salik.totalCost + darb.totalCost + parking.totalCost),
      totalCollected: round2(salik.totalCollected + darb.totalCollected + parking.totalCollected),
      totalNetProfit: round2(salik.totalNetProfit + darb.totalNetProfit + parking.totalNetProfit),
      count: salik.count + darb.count + parking.count
    }
  };
}
