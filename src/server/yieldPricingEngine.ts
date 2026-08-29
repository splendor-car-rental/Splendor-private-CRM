import { SeasonalityRule, OccupancyMultiplierRule, YieldPricingQuoteResult, VehicleCategory, Vehicle } from '../types';

export class YieldPricingEngine {
  public static readonly DEFAULT_SEASONALITY_RULES: SeasonalityRule[] = [
    {
      id: 'SEAS-F1-ABU-DHABI',
      name: 'Abu Dhabi Formula 1 Grand Prix Season',
      nameAr: 'موسم جائزة أبوظبي الكبرى للفورمولا 1',
      startDate: '11-15',
      endDate: '12-05',
      multiplier: 1.40, // +40% surge
      applicableCategories: ['supercar', 'exotic_convertible', 'executive_suv', 'ultra_luxury_sedan', 'grand_tourer'],
      minRentalDays: 3,
      active: true
    },
    {
      id: 'SEAS-GITEX-DUBAI',
      name: 'GITEX Global Dubai Week',
      nameAr: 'أسبوع جيتكس جلوبال دبي',
      startDate: '10-10',
      endDate: '10-20',
      multiplier: 1.25, // +25% surge
      active: true
    },
    {
      id: 'SEAS-NEW-YEAR',
      name: 'Dubai Luxury New Year & Festive Season',
      nameAr: 'موسم رأس السنة والأعياد الفارهة في دبي',
      startDate: '12-24',
      endDate: '01-05',
      multiplier: 1.50, // +50% surge
      active: true
    }
  ];

  public static readonly DEFAULT_OCCUPANCY_RULES: OccupancyMultiplierRule[] = [
    { id: 'OCC-HIGH', minOccupancyPercent: 85, maxOccupancyPercent: 94, multiplier: 1.15, active: true },
    { id: 'OCC-CRITICAL', minOccupancyPercent: 95, maxOccupancyPercent: 100, multiplier: 1.30, active: true }
  ];

  /**
   * Duration discount curve
   */
  public static getDurationDiscountPercent(totalDays: number): number {
    if (totalDays >= 30) return 25; // 25% monthly
    if (totalDays >= 14) return 18; // 18% fortnight
    if (totalDays >= 7) return 12;  // 12% weekly
    if (totalDays >= 3) return 5;   // 5% 3-day weekend
    return 0;
  }

  /**
   * Calculate Fleet Occupancy percentage
   */
  public static calculateFleetOccupancy(vehicles: Vehicle[], category?: VehicleCategory): number {
    const relevant = category ? vehicles.filter(v => v.category === category) : vehicles;
    if (relevant.length === 0) return 0;

    const rentedCount = relevant.filter(v => ['rented', 'reserved'].includes(v.status)).length;
    return Math.round((rentedCount / relevant.length) * 100);
  }

  /**
   * Compute server-authoritative Yield Pricing for a given vehicle & date range
   */
  public static computeYieldQuote(
    vehicle: Vehicle,
    pickupDateTime: string,
    returnDateTime: string,
    fleetVehicles: Vehicle[],
    seasonalityRules: SeasonalityRule[] = this.DEFAULT_SEASONALITY_RULES,
    occupancyRules: OccupancyMultiplierRule[] = this.DEFAULT_OCCUPANCY_RULES
  ): YieldPricingQuoteResult {
    const startMs = new Date(pickupDateTime).getTime();
    const endMs = new Date(returnDateTime).getTime();
    const diffMs = Math.max(endMs - startMs, 86400000);
    const totalDays = Math.max(1, Math.ceil(diffMs / 86400000));

    const baseDailyRate = vehicle.dailyRate || 1500;
    const calculationBreakdown: string[] = [
      `Base Vehicle Rate: AED ${baseDailyRate.toLocaleString()}/day (${vehicle.make} ${vehicle.model})`
    ];

    // 1. Seasonality Multiplier
    let seasonalityMultiplier = 1.0;
    let seasonalityApplied: string | undefined;

    const pickupDateStr = pickupDateTime.slice(5, 10); // MM-DD
    for (const rule of seasonalityRules) {
      if (!rule.active) continue;
      if (rule.applicableCategories && !rule.applicableCategories.includes(vehicle.category)) continue;

      const matches = rule.startDate <= rule.endDate
        ? (pickupDateStr >= rule.startDate && pickupDateStr <= rule.endDate)
        : (pickupDateStr >= rule.startDate || pickupDateStr <= rule.endDate); // wrapping across new year

      if (matches) {
        seasonalityMultiplier = rule.multiplier;
        seasonalityApplied = rule.name;
        calculationBreakdown.push(
          `Seasonality Surge (${rule.name}): +${Math.round((rule.multiplier - 1) * 100)}%`
        );
        break;
      }
    }

    // 2. Fleet Occupancy Multiplier
    const occupancyPercent = this.calculateFleetOccupancy(fleetVehicles, vehicle.category);
    let occupancyMultiplier = 1.0;
    for (const occRule of occupancyRules) {
      if (!occRule.active) continue;
      if (occupancyPercent >= occRule.minOccupancyPercent && occupancyPercent <= occRule.maxOccupancyPercent) {
        occupancyMultiplier = occRule.multiplier;
        calculationBreakdown.push(
          `Fleet Occupancy Surge (${occupancyPercent}% fleet active): +${Math.round((occRule.multiplier - 1) * 100)}%`
        );
        break;
      }
    }

    // 3. Multi-day Duration Discount
    const durationDiscountPercent = this.getDurationDiscountPercent(totalDays);
    if (durationDiscountPercent > 0) {
      calculationBreakdown.push(
        `Duration Tier Discount (${totalDays} days): -${durationDiscountPercent}%`
      );
    }

    // Combined Daily Rate
    let surgedDailyRate = baseDailyRate * seasonalityMultiplier * occupancyMultiplier;
    let discountedDailyRate = surgedDailyRate * (1 - durationDiscountPercent / 100);
    const finalDailyRate = Math.round(discountedDailyRate);

    const subtotal = finalDailyRate * totalDays;
    const vatAmount = Math.round(subtotal * 0.05 * 100) / 100; // 5% UAE VAT
    const grandTotal = subtotal + vatAmount;
    const suggestedDeposit = (vehicle as any).deposit || (vehicle as any).websitePublication?.deposit || (vehicle.category === 'supercar' ? 10000 : 5000);

    calculationBreakdown.push(`Total Subtotal: AED ${subtotal.toLocaleString()} (${totalDays} days @ AED ${finalDailyRate.toLocaleString()}/day)`);
    calculationBreakdown.push(`UAE VAT (5%): AED ${vatAmount.toLocaleString()}`);
    calculationBreakdown.push(`Grand Total: AED ${grandTotal.toLocaleString()}`);

    return {
      baseDailyRate,
      seasonalityMultiplier,
      seasonalityApplied,
      occupancyMultiplier,
      occupancyPercent,
      durationDiscountPercent,
      finalDailyRate,
      totalDays,
      subtotal,
      vatAmount,
      grandTotal,
      suggestedDeposit,
      calculationBreakdown
    };
  }
}
