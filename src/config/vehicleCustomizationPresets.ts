export interface ColorPreset {
  id: string;
  nameEn: string;
  nameAr: string;
  hex: string;
  accentHex?: string;
  category?: 'classic' | 'luxury' | 'sport' | 'matte';
}

export interface CountryPreset {
  id: string;
  nameEn: string;
  nameAr: string;
  flag: string;
  majorMakes?: string;
}

export const EXTERIOR_COLOR_PRESETS: ColorPreset[] = [
  { id: 'pearl_white', nameEn: 'Pearl White / Metallic White', nameAr: 'أبيض لؤلؤي لامع', hex: '#FFFFFF', category: 'classic' },
  { id: 'polar_white', nameEn: 'Polar White', nameAr: 'أبيض قطبي نقي', hex: '#F8FAFC', category: 'classic' },
  { id: 'obsidian_black', nameEn: 'Obsidian Mythos Black', nameAr: 'أسود ملكي فاحم / ميثيك', hex: '#0A0A0B', category: 'classic' },
  { id: 'titanium_grey', nameEn: 'Titanium / Nardo Grey', nameAr: 'رمادي تيتانيوم / ناردو جري', hex: '#64748B', category: 'luxury' },
  { id: 'liquid_silver', nameEn: 'Liquid Iridium Silver', nameAr: 'فضي نيزكي لامع', hex: '#CBD5E1', category: 'classic' },
  { id: 'rosso_red', nameEn: 'Rosso Corsa / Carmine Red', nameAr: 'أحمر كورسا رياضي / فيراري', hex: '#DC2626', category: 'sport' },
  { id: 'sapphire_blue', nameEn: 'Royal Sapphire Blue', nameAr: 'أزرق ياقوتي ملكي', hex: '#1E40AF', category: 'luxury' },
  { id: 'navy_blue', nameEn: 'Deep Metallic Navy Blue', nameAr: 'أزرق كحلي نافي ملكي', hex: '#0F172A', category: 'luxury' },
  { id: 'speed_yellow', nameEn: 'Speed Giallo Yellow', nameAr: 'أصفر كناري سبيد رياضي', hex: '#EAB308', category: 'sport' },
  { id: 'emerald_green', nameEn: 'Emerald / British Racing Green', nameAr: 'أخضر زمردي بريطاني فاخر', hex: '#065F46', category: 'luxury' },
  { id: 'arancio_orange', nameEn: 'Arancio Pearl Orange', nameAr: 'برتقالي ناري / أرانشيو لامبورغيني', hex: '#EA580C', category: 'sport' },
  { id: 'kalahari_gold', nameEn: 'Kalahari Gold / Champagne', nameAr: 'ذهبي كالهاري / شامبين فاخر', hex: '#D97706', category: 'luxury' },
  { id: 'matte_grey', nameEn: 'Satin Matte Magno Grey', nameAr: 'رمادي كربوني مطفي (مات)', hex: '#374151', category: 'matte' },
  { id: 'mocha_bronze', nameEn: 'Mocha Bronze Metallic', nameAr: 'برونزي موكا فاخر', hex: '#78350F', category: 'luxury' },
  { id: 'twotone_black_gold', nameEn: 'Two-Tone Obsidian & Gold', nameAr: 'لونان: أسود ملكي مع ذهبي مايباخ', hex: '#1C1917', accentHex: '#F59E0B', category: 'luxury' },
  { id: 'twotone_silver_black', nameEn: 'Two-Tone Silver & Black', nameAr: 'لونان: فضي نيزكي مع أسود رولز رويس', hex: '#94A3B8', accentHex: '#000000', category: 'luxury' }
];

export const INTERIOR_COLOR_PRESETS: ColorPreset[] = [
  { id: 'royal_beige', nameEn: 'Luxury Royal Beige Leather', nameAr: 'جلد بيج ملكي فاخر', hex: '#F5F5DC' },
  { id: 'nappa_black', nameEn: 'Black Nappa Leather with Contrast Stitching', nameAr: 'جلد أسود نابا مع تطريز فاخر', hex: '#18181B' },
  { id: 'cognac_tan', nameEn: 'Tan / Cognac Italian Leather', nameAr: 'جلد جملي / هافان إيطالي (كونياك)', hex: '#C2884A' },
  { id: 'bordeaux_red', nameEn: 'Crimson / Bordeaux Red Sport Leather', nameAr: 'جلد أحمر رياضي بوردو', hex: '#991B1B' },
  { id: 'arctic_white', nameEn: 'Arctic White / Ivory Luxury Leather', nameAr: 'جلد أبيض عاجي ثلجي (أوف وايت)', hex: '#FAFAFA' },
  { id: 'mocha_brown', nameEn: 'Mocha / Chocolate Brown Leather', nameAr: 'جلد بني موكا شوكولاتة', hex: '#582F0E' },
  { id: 'carbon_grey', nameEn: 'Carbon Anthracite & Alcantara', nameAr: 'جلد رمادي أنثراسيت وألكانتارا رياضية', hex: '#3F3F46' },
  { id: 'royal_navy_interior', nameEn: 'Royal Navy Blue Bespoke Leather', nameAr: 'جلد أزرق كحلي ملكي بيسبوك', hex: '#1E293B' },
  { id: 'twotone_black_orange', nameEn: 'Two-Tone Black & Hermes Orange', nameAr: 'تو-تون: أسود مع برتقالي هيرمس', hex: '#09090B', accentHex: '#EA580C' },
  { id: 'twotone_beige_navy', nameEn: 'Two-Tone Royal Beige & Navy', nameAr: 'تو-تون: بيج ملكي مع كحلي فاخر', hex: '#E2E8F0', accentHex: '#1E3A8A' }
];

export const COUNTRY_OF_ORIGIN_PRESETS: CountryPreset[] = [
  { id: 'kr', nameEn: 'South Korea', nameAr: 'كوريا الجنوبية', flag: '🇰🇷', majorMakes: 'Hyundai, Kia, Genesis' },
  { id: 'jp', nameEn: 'Japan', nameAr: 'اليابان', flag: '🇯🇵', majorMakes: 'Toyota, Nissan, Lexus, Honda, Mazda' },
  { id: 'cn', nameEn: 'China', nameAr: 'الصين', flag: '🇨🇳', majorMakes: 'Jetour, MG, Geely, BYD, Haval, Hongqi' },
  { id: 'de', nameEn: 'Germany', nameAr: 'ألمانيا', flag: '🇩🇪', majorMakes: 'Mercedes-Benz, BMW, Porsche, Audi, Maybach' },
  { id: 'it', nameEn: 'Italy', nameAr: 'إيطاليا', flag: '🇮🇹', majorMakes: 'Ferrari, Lamborghini, Maserati, Alfa Romeo' },
  { id: 'gb', nameEn: 'United Kingdom', nameAr: 'المملكة المتحدة (بريطانيا)', flag: '🇬🇧', majorMakes: 'Rolls-Royce, Bentley, Range Rover, Aston Martin, McLaren' },
  { id: 'us', nameEn: 'United States', nameAr: 'الولايات المتحدة الأمريكية', flag: '🇺🇸', majorMakes: 'Cadillac, Chevrolet, Ford, GMC, Tesla, Dodge' },
  { id: 'fr', nameEn: 'France', nameAr: 'فرنسا', flag: '🇫🇷', majorMakes: 'Bugatti, Peugeot, Renault' },
  { id: 'se', nameEn: 'Sweden', nameAr: 'السويد', flag: '🇸🇪', majorMakes: 'Koenigsegg, Volvo' },
  { id: 'cz', nameEn: 'Czech Republic', nameAr: 'جمهورية التشيك', flag: '🇨🇿', majorMakes: 'Škoda' },
  { id: 'es', nameEn: 'Spain', nameAr: 'إسبانيا', flag: '🇪🇸', majorMakes: 'SEAT, Cupra' },
  { id: 'at', nameEn: 'Austria', nameAr: 'النمسا', flag: '🇦🇹', majorMakes: 'KTM, Steyr' }
];
