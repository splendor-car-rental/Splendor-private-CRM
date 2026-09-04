import type {
  VehicleBodyStyle, VehicleClassTier, VehicleSuvClass, VehiclePerformanceClass,
  VehicleRentalSegment, VehicleUsageType, VehicleDrivetrain, VehicleRoofType, Vehicle
} from '../types/index.js';

/**
 * SPLENDOR Vehicle Master Profile -- centralized classification dropdowns.
 * Every screen that lets staff pick a body style / vehicle class / SUV
 * class / performance class / rental segment / usage type / drivetrain /
 * roof type reads from these lists -- never a free-text field, and never a
 * second copy of the same list defined in a component.
 */

export interface ClassificationOption<T extends string> {
  value: T;
  labelEn: string;
  labelAr: string;
}

export const VEHICLE_BODY_STYLES: ClassificationOption<VehicleBodyStyle>[] = [
  { value: 'sedan', labelEn: 'Sedan', labelAr: 'سيدان' },
  { value: 'hatchback', labelEn: 'Hatchback', labelAr: 'هاتشباك' },
  { value: 'liftback', labelEn: 'Liftback', labelAr: 'ليفتباك' },
  { value: 'fastback', labelEn: 'Fastback', labelAr: 'فاستباك' },
  { value: 'coupe', labelEn: 'Coupe', labelAr: 'كوبيه' },
  { value: 'convertible', labelEn: 'Convertible / Cabriolet', labelAr: 'مكشوفة / كابريوليه' },
  { value: 'roadster', labelEn: 'Roadster', labelAr: 'رودستر' },
  { value: 'spider', labelEn: 'Spider', labelAr: 'سبايدر' },
  { value: 'targa', labelEn: 'Targa', labelAr: 'تارغا' },
  { value: 'wagon', labelEn: 'Wagon / Estate', labelAr: 'واجن / ستيشن' },
  { value: 'shooting_brake', labelEn: 'Shooting Brake', labelAr: 'شوتينغ بريك' },
  { value: 'suv', labelEn: 'SUV', labelAr: 'SUV' },
  { value: 'crossover', labelEn: 'Crossover', labelAr: 'كروس أوفر' },
  { value: 'suv_coupe', labelEn: 'SUV Coupe', labelAr: 'SUV كوبيه' },
  { value: 'mpv', labelEn: 'MPV', labelAr: 'MPV' },
  { value: 'minivan', labelEn: 'Minivan', labelAr: 'ميني فان' },
  { value: 'van', labelEn: 'Van', labelAr: 'فان' },
  { value: 'panel_van', labelEn: 'Panel Van', labelAr: 'فان مغلق' },
  { value: 'minibus', labelEn: 'Minibus', labelAr: 'ميني باص' },
  { value: 'pickup', labelEn: 'Pickup', labelAr: 'بيك أب' },
  { value: 'truck', labelEn: 'Truck', labelAr: 'شاحنة' },
  { value: 'cab_chassis', labelEn: 'Cab & Chassis', labelAr: 'كابينة وشاسيه' },
  { value: 'limousine', labelEn: 'Limousine', labelAr: 'ليموزين' },
  { value: 'microcar', labelEn: 'Microcar', labelAr: 'سيارة صغيرة جداً' },
  { value: 'city_car', labelEn: 'City Car', labelAr: 'سيارة مدينة' },
  { value: 'kei', labelEn: 'Kei Car', labelAr: 'Kei' }
];

export const VEHICLE_CLASS_TIERS: ClassificationOption<VehicleClassTier>[] = [
  { value: 'economy', labelEn: 'Economy', labelAr: 'اقتصادية' },
  { value: 'compact', labelEn: 'Compact', labelAr: 'مدمجة' },
  { value: 'midsize', labelEn: 'Midsize', labelAr: 'متوسطة' },
  { value: 'executive', labelEn: 'Executive', labelAr: 'تنفيذية' },
  { value: 'luxury', labelEn: 'Luxury', labelAr: 'فاخرة' },
  { value: 'ultra_luxury', labelEn: 'Ultra Luxury', labelAr: 'فاخرة جداً' },
  { value: 'sport', labelEn: 'Sport', labelAr: 'رياضية' },
  { value: 'supercar', labelEn: 'Supercar', labelAr: 'سوبركار' },
  { value: 'hypercar', labelEn: 'Hypercar', labelAr: 'هايبركار' }
];

export const VEHICLE_SUV_CLASSES: ClassificationOption<VehicleSuvClass>[] = [
  { value: 'compact_suv', labelEn: 'Compact SUV', labelAr: 'SUV مدمجة' },
  { value: 'midsize_suv', labelEn: 'Midsize SUV', labelAr: 'SUV متوسطة' },
  { value: 'large_suv', labelEn: 'Large SUV', labelAr: 'SUV كبيرة' },
  { value: 'luxury_suv', labelEn: 'Luxury SUV', labelAr: 'SUV فاخرة' },
  { value: 'performance_suv', labelEn: 'High-Performance SUV', labelAr: 'SUV عالية الأداء' },
  { value: 'suv_coupe', labelEn: 'SUV Coupe', labelAr: 'SUV كوبيه' },
  { value: 'offroad_suv', labelEn: 'Off-Road SUV', labelAr: 'SUV للطرق الوعرة' }
];

export const VEHICLE_PERFORMANCE_CLASSES: ClassificationOption<VehiclePerformanceClass>[] = [
  { value: 'standard', labelEn: 'Standard', labelAr: 'عادية' },
  { value: 'high_performance', labelEn: 'High Performance', labelAr: 'عالية الأداء' },
  { value: 'sport', labelEn: 'Sport', labelAr: 'رياضية' },
  { value: 'supercar', labelEn: 'Supercar', labelAr: 'سوبركار' },
  { value: 'hypercar', labelEn: 'Hypercar', labelAr: 'هايبركار' }
];

export const VEHICLE_RENTAL_SEGMENTS: ClassificationOption<VehicleRentalSegment>[] = [
  { value: 'economy', labelEn: 'Economy', labelAr: 'اقتصادية' },
  { value: 'standard', labelEn: 'Standard', labelAr: 'قياسية' },
  { value: 'premium', labelEn: 'Premium', labelAr: 'بريميوم' },
  { value: 'luxury', labelEn: 'Luxury', labelAr: 'فاخرة' },
  { value: 'ultra_luxury', labelEn: 'Ultra Luxury', labelAr: 'فاخرة جداً' },
  { value: 'executive', labelEn: 'Executive', labelAr: 'تنفيذية' },
  { value: 'sport', labelEn: 'Sport', labelAr: 'رياضية' },
  { value: 'supercar', labelEn: 'Supercar', labelAr: 'سوبركار' },
  { value: 'hypercar', labelEn: 'Hypercar', labelAr: 'هايبركار' },
  { value: 'luxury_suv', labelEn: 'Luxury SUV', labelAr: 'SUV فاخرة' },
  { value: 'vip', labelEn: 'VIP', labelAr: 'VIP' },
  { value: 'chauffeur_driven', labelEn: 'Chauffeur-Driven', labelAr: 'سائق خاص' }
];

export const VEHICLE_USAGE_TYPES: ClassificationOption<VehicleUsageType>[] = [
  { value: 'daily', labelEn: 'Daily', labelAr: 'يومي' },
  { value: 'business', labelEn: 'Business', labelAr: 'أعمال' },
  { value: 'family', labelEn: 'Family', labelAr: 'عائلي' },
  { value: 'vip', labelEn: 'VIP', labelAr: 'VIP' },
  { value: 'chauffeur_driven', labelEn: 'Chauffeur-Driven', labelAr: 'سائق خاص' },
  { value: 'luxury', labelEn: 'Luxury', labelAr: 'فاخر' },
  { value: 'performance', labelEn: 'Performance', labelAr: 'أداء' },
  { value: 'offroad', labelEn: 'Off-Road', labelAr: 'طرق وعرة' },
  { value: 'commercial', labelEn: 'Commercial', labelAr: 'تجاري' }
];

export const VEHICLE_DRIVETRAINS: ClassificationOption<VehicleDrivetrain>[] = [
  { value: 'fwd', labelEn: 'Front-Wheel Drive', labelAr: 'دفع أمامي' },
  { value: 'rwd', labelEn: 'Rear-Wheel Drive', labelAr: 'دفع خلفي' },
  { value: 'awd', labelEn: 'All-Wheel Drive', labelAr: 'دفع كلي' },
  { value: '4wd', labelEn: 'Four-Wheel Drive', labelAr: 'دفع رباعي' }
];

export const VEHICLE_FUEL_TYPES: ClassificationOption<Vehicle['fuelType']>[] = [
  { value: 'petrol', labelEn: 'Petrol', labelAr: 'بنزين' },
  { value: 'diesel', labelEn: 'Diesel', labelAr: 'ديزل' },
  { value: 'hybrid', labelEn: 'Hybrid', labelAr: 'هجين' },
  { value: 'phev', labelEn: 'Plug-in Hybrid', labelAr: 'هجين قابل للشحن' },
  { value: 'electric', labelEn: 'Electric', labelAr: 'كهربائي' },
  { value: 'hydrogen', labelEn: 'Hydrogen', labelAr: 'هيدروجين' }
];

export const VEHICLE_ROOF_TYPES: ClassificationOption<VehicleRoofType>[] = [
  { value: 'fixed', labelEn: 'Fixed', labelAr: 'ثابت' },
  { value: 'sunroof', labelEn: 'Sunroof', labelAr: 'فتحة سقف' },
  { value: 'panoramic', labelEn: 'Panoramic', labelAr: 'بانورامي' },
  { value: 'targa', labelEn: 'Targa', labelAr: 'تارغا' },
  { value: 'soft_top', labelEn: 'Soft Top', labelAr: 'قماشي' },
  { value: 'retractable_hard_top', labelEn: 'Retractable Hard Top', labelAr: 'صلب قابل للفتح' },
  { value: 'folding_hard_top', labelEn: 'Folding Hard Top', labelAr: 'صلب قابل للطي' }
];

function byValue<T extends string>(list: ClassificationOption<T>[]): Record<string, ClassificationOption<T>> {
  return Object.fromEntries(list.map(o => [o.value, o]));
}

export const VEHICLE_BODY_STYLE_BY_VALUE = byValue(VEHICLE_BODY_STYLES);
export const VEHICLE_CLASS_TIER_BY_VALUE = byValue(VEHICLE_CLASS_TIERS);
export const VEHICLE_SUV_CLASS_BY_VALUE = byValue(VEHICLE_SUV_CLASSES);
export const VEHICLE_PERFORMANCE_CLASS_BY_VALUE = byValue(VEHICLE_PERFORMANCE_CLASSES);
export const VEHICLE_RENTAL_SEGMENT_BY_VALUE = byValue(VEHICLE_RENTAL_SEGMENTS);
export const VEHICLE_USAGE_TYPE_BY_VALUE = byValue(VEHICLE_USAGE_TYPES);
export const VEHICLE_DRIVETRAIN_BY_VALUE = byValue(VEHICLE_DRIVETRAINS);
export const VEHICLE_FUEL_TYPE_BY_VALUE = byValue(VEHICLE_FUEL_TYPES);
export const VEHICLE_ROOF_TYPE_BY_VALUE = byValue(VEHICLE_ROOF_TYPES);

/** SUV-specific classification only makes sense once a body style in the SUV family is chosen. */
const SUV_BODY_STYLES: VehicleBodyStyle[] = ['suv', 'crossover', 'suv_coupe'];
export function isSuvBodyStyle(bodyStyle: VehicleBodyStyle | undefined | null): boolean {
  return !!bodyStyle && SUV_BODY_STYLES.includes(bodyStyle);
}
