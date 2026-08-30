import type { Vehicle } from '../types';

/**
 * SPLENDOR Verified Publish Gate (Vehicle Master Profile mission, section
 * 21). This is the single place that decides whether a vehicle is allowed
 * onto the public website. It never invents a missing value to let a
 * publish through -- every check here is "is this real, confirmed data
 * already on the vehicle's own record", never a guess.
 *
 * Called from PUT /api/fleet/:id/website-publish before `enabled:true` is
 * accepted, and again whenever an already-published vehicle's core data is
 * edited (re-verification on every subsequent edit, per section 21.6).
 */

export interface PublishReadinessResult {
  ready: boolean;
  missingReasons: string[]; // Arabic, matching the mandated message format
  missingReasonsEn: string[];
}

function isBlank(value: string | undefined | null): boolean {
  return !value || !value.trim();
}

export function evaluateVehiclePublishReadiness(vehicle: Vehicle): PublishReadinessResult {
  const reasons: Array<{ ar: string; en: string }> = [];

  // Confirmed basic data
  if (isBlank(vehicle.make)) reasons.push({ ar: 'الشركة المصنعة غير محددة', en: 'Manufacturer (make) is missing' });
  if (isBlank(vehicle.model)) reasons.push({ ar: 'الموديل غير محدد', en: 'Model is missing' });
  if (!vehicle.year || vehicle.year < 1900) reasons.push({ ar: 'سنة الصنع غير محددة أو غير صحيحة', en: 'Model year is missing or invalid' });
  if (isBlank(vehicle.exteriorColor)) reasons.push({ ar: 'اللون الخارجي غير محدد', en: 'Exterior color is missing' });
  if (isBlank(vehicle.interiorColor)) reasons.push({ ar: 'اللون الداخلي غير محدد', en: 'Interior color is missing' });
  if (isBlank(vehicle.category)) reasons.push({ ar: 'الفئة غير محددة', en: 'Category is missing' });

  // Confirmed technical/display data -- never published as a guess
  if (isBlank(vehicle.engine)) reasons.push({ ar: 'بيانات المحرك غير مؤكدة', en: 'Engine data is unconfirmed' });
  if (!vehicle.horsepower || vehicle.horsepower <= 0) reasons.push({ ar: 'قوة المحرك (حصان) غير مؤكدة', en: 'Horsepower is unconfirmed' });
  if (isBlank(vehicle.transmission)) reasons.push({ ar: 'ناقل الحركة غير مؤكد', en: 'Transmission is unconfirmed' });
  if (isBlank(vehicle.fuelType)) reasons.push({ ar: 'نوع الوقود غير مؤكد', en: 'Fuel type is unconfirmed' });

  // Required display data (photos)
  if (!vehicle.images || vehicle.images.length === 0) reasons.push({ ar: 'لا توجد صور معتمدة للمركبة', en: 'No approved vehicle photos' });
  if (isBlank(vehicle.thumbnail)) reasons.push({ ar: 'لا توجد صورة مصغرة رئيسية', en: 'No main thumbnail photo' });

  // Confirmed commercial data
  if (!vehicle.dailyRate || vehicle.dailyRate <= 0) reasons.push({ ar: 'السعر اليومي غير محدد', en: 'Daily rate is missing' });
  if (vehicle.minDeposit === undefined || vehicle.minDeposit === null || vehicle.minDeposit < 0) {
    reasons.push({ ar: 'مبلغ التأمين غير محدد', en: 'Security deposit amount is missing' });
  }

  const pub = vehicle.website;
  if (pub) {
    if (isBlank(pub.publicName)) reasons.push({ ar: 'الاسم المعروض للعامة غير محدد', en: 'Public display name is missing' });
    if (isBlank(pub.publicDescription)) reasons.push({ ar: 'الوصف المعروض للعامة غير محدد', en: 'Public description is missing' });
    if (!pub.mileageAllowance || pub.mileageAllowance <= 0) {
      reasons.push({ ar: 'حد المسافة اليومي المسموح به غير محدد', en: 'Daily mileage allowance is missing' });
    }
  }

  return {
    ready: reasons.length === 0,
    missingReasons: reasons.map((r) => r.ar),
    missingReasonsEn: reasons.map((r) => r.en)
  };
}
