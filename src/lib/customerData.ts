export interface CountryInfo {
  iso: string;
  name: string;
  nameAr: string;
  nationalityEn: string;
  nationalityAr: string;
  code: string; // e.g. "+971"
  flag: string;
  placeholder: string;
  isGCC?: boolean;
  isRtaExempted?: boolean; // Dubai RTA permits driving directly on home license
}

export const ALL_COUNTRIES: CountryInfo[] = [
  // GCC Countries (RTA Approved)
  { iso: 'AE', name: 'United Arab Emirates', nameAr: 'الإمارات العربية المتحدة', nationalityEn: 'Emirati', nationalityAr: 'إماراتي', code: '+971', flag: '🇦🇪', placeholder: '50 123 4567', isGCC: true, isRtaExempted: true },
  { iso: 'SA', name: 'Saudi Arabia', nameAr: 'المملكة العربية السعودية', nationalityEn: 'Saudi', nationalityAr: 'سعودي', code: '+966', flag: '🇸🇦', placeholder: '50 123 4567', isGCC: true, isRtaExempted: true },
  { iso: 'QA', name: 'Qatar', nameAr: 'دولة قطر', nationalityEn: 'Qatari', nationalityAr: 'قطري', code: '+974', flag: '🇶🇦', placeholder: '5512 3456', isGCC: true, isRtaExempted: true },
  { iso: 'KW', name: 'Kuwait', nameAr: 'دولة الكويت', nationalityEn: 'Kuwaiti', nationalityAr: 'كويتي', code: '+965', flag: '🇰🇼', placeholder: '9123 4567', isGCC: true, isRtaExempted: true },
  { iso: 'BH', name: 'Bahrain', nameAr: 'مملكة البحرين', nationalityEn: 'Bahraini', nationalityAr: 'بحريني', code: '+973', flag: '🇧🇭', placeholder: '3912 3456', isGCC: true, isRtaExempted: true },
  { iso: 'OM', name: 'Oman', nameAr: 'سلطنة عمان', nationalityEn: 'Omani', nationalityAr: 'عماني', code: '+968', flag: '🇴🇲', placeholder: '9123 4567', isGCC: true, isRtaExempted: true },

  // Arab Countries
  { iso: 'EG', name: 'Egypt', nameAr: 'جمهورية مصر العربية', nationalityEn: 'Egyptian', nationalityAr: 'مصري', code: '+20', flag: '🇪🇬', placeholder: '100 123 4567' },
  { iso: 'JO', name: 'Jordan', nameAr: 'المملكة الأردنية الهاشمية', nationalityEn: 'Jordanian', nationalityAr: 'أردني', code: '+962', flag: '🇯🇴', placeholder: '7 9123 4567' },
  { iso: 'LB', name: 'Lebanon', nameAr: 'الجمهورية اللبنانية', nationalityEn: 'Lebanese', nationalityAr: 'لبناني', code: '+961', flag: '🇱🇧', placeholder: '70 123 456' },
  { iso: 'MA', name: 'Morocco', nameAr: 'المملكة المغربية', nationalityEn: 'Moroccan', nationalityAr: 'مغربي', code: '+212', flag: '🇲🇦', placeholder: '661 123456' },
  { iso: 'DZ', name: 'Algeria', nameAr: 'الجمهورية الجزائرية', nationalityEn: 'Algerian', nationalityAr: 'جزائري', code: '+213', flag: '🇩🇿', placeholder: '550 123456' },
  { iso: 'TN', name: 'Tunisia', nameAr: 'الجمهورية التونسية', nationalityEn: 'Tunisian', nationalityAr: 'تونسي', code: '+216', flag: '🇹🇳', placeholder: '20 123 456' },
  { iso: 'IQ', name: 'Iraq', nameAr: 'جمهورية العراق', nationalityEn: 'Iraqi', nationalityAr: 'عراقي', code: '+964', flag: '🇮🇶', placeholder: '770 123 4567' },
  { iso: 'SY', name: 'Syria', nameAr: 'الجمهورية العربية السورية', nationalityEn: 'Syrian', nationalityAr: 'سوري', code: '+963', flag: '🇸🇾', placeholder: '944 123 456' },
  { iso: 'YE', name: 'Yemen', nameAr: 'الجمهورية اليمنية', nationalityEn: 'Yemeni', nationalityAr: 'يمني', code: '+967', flag: '🇾🇪', placeholder: '771 234 567' },
  { iso: 'PS', name: 'Palestine', nameAr: 'دولة فلسطين', nationalityEn: 'Palestinian', nationalityAr: 'فلسطيني', code: '+970', flag: '🇵🇸', placeholder: '599 123 456' },
  { iso: 'SD', name: 'Sudan', nameAr: 'جمهورية السودان', nationalityEn: 'Sudanese', nationalityAr: 'سوداني', code: '+249', flag: '🇸🇩', placeholder: '91 234 5678' },
  { iso: 'LY', name: 'Libya', nameAr: 'دولة ليبيا', nationalityEn: 'Libyan', nationalityAr: 'ليبي', code: '+218', flag: '🇱🇾', placeholder: '91 123 4567' },

  // Major European & Western Countries (Dubai RTA Approved)
  { iso: 'GB', name: 'United Kingdom', nameAr: 'المملكة المتحدة (بريطانيا)', nationalityEn: 'British', nationalityAr: 'بريطاني', code: '+44', flag: '🇬🇧', placeholder: '7911 123456', isRtaExempted: true },
  { iso: 'US', name: 'United States', nameAr: 'الولايات المتحدة الأمريكية', nationalityEn: 'American', nationalityAr: 'أمريكي', code: '+1', flag: '🇺🇸', placeholder: '202 555 0123', isRtaExempted: true },
  { iso: 'CA', name: 'Canada', nameAr: 'كندا', nationalityEn: 'Canadian', nationalityAr: 'كندي', code: '+1', flag: '🇨🇦', placeholder: '416 555 0123', isRtaExempted: true },
  { iso: 'DE', name: 'Germany', nameAr: 'ألمانيا', nationalityEn: 'German', nationalityAr: 'ألماني', code: '+49', flag: '🇩🇪', placeholder: '170 1234567', isRtaExempted: true },
  { iso: 'FR', name: 'France', nameAr: 'فرنسا', nationalityEn: 'French', nationalityAr: 'فرنسي', code: '+33', flag: '🇫🇷', placeholder: '6 12 34 56 78', isRtaExempted: true },
  { iso: 'IT', name: 'Italy', nameAr: 'إيطاليا', nationalityEn: 'Italian', nationalityAr: 'إيطالي', code: '+39', flag: '🇮🇹', placeholder: '320 123 4567', isRtaExempted: true },
  { iso: 'ES', name: 'Spain', nameAr: 'إسبانيا', nationalityEn: 'Spanish', nationalityAr: 'إسباني', code: '+34', flag: '🇪🇸', placeholder: '612 34 56 78', isRtaExempted: true },
  { iso: 'CH', name: 'Switzerland', nameAr: 'سويسرا', nationalityEn: 'Swiss', nationalityAr: 'سويسري', code: '+41', flag: '🇨🇭', placeholder: '78 123 45 67', isRtaExempted: true },
  { iso: 'AT', name: 'Austria', nameAr: 'النمسا', nationalityEn: 'Austrian', nationalityAr: 'نمساوي', code: '+43', flag: '🇦🇹', placeholder: '660 123 4567', isRtaExempted: true },
  { iso: 'BE', name: 'Belgium', nameAr: 'بلجيكا', nationalityEn: 'Belgian', nationalityAr: 'بلجيكي', code: '+32', flag: '🇧🇪', placeholder: '470 12 34 56', isRtaExempted: true },
  { iso: 'NL', name: 'Netherlands', nameAr: 'هولندا', nationalityEn: 'Dutch', nationalityAr: 'هولندي', code: '+31', flag: '🇳🇱', placeholder: '6 12345678', isRtaExempted: true },
  { iso: 'SE', name: 'Sweden', nameAr: 'السويد', nationalityEn: 'Swedish', nationalityAr: 'سويدي', code: '+46', flag: '🇸🇪', placeholder: '70 123 45 67', isRtaExempted: true },
  { iso: 'NO', name: 'Norway', nameAr: 'النرويج', nationalityEn: 'Norwegian', nationalityAr: 'نرويجي', code: '+47', flag: '🇳🇴', placeholder: '412 34 567', isRtaExempted: true },
  { iso: 'DK', name: 'Denmark', nameAr: 'الدنمارك', nationalityEn: 'Danish', nationalityAr: 'دنماركي', code: '+45', flag: '🇩🇰', placeholder: '20 12 34 56', isRtaExempted: true },
  { iso: 'FI', name: 'Finland', nameAr: 'فنلندا', nationalityEn: 'Finnish', nationalityAr: 'فنلندي', code: '+358', flag: '🇫🇮', placeholder: '40 1234567', isRtaExempted: true },
  { iso: 'IE', name: 'Ireland', nameAr: 'أيرلندا', nationalityEn: 'Irish', nationalityAr: 'أيرلندي', code: '+353', flag: '🇮🇪', placeholder: '85 123 4567', isRtaExempted: true },
  { iso: 'PL', name: 'Poland', nameAr: 'بولندا', nationalityEn: 'Polish', nationalityAr: 'بولندي', code: '+48', flag: '🇵🇱', placeholder: '501 234 567', isRtaExempted: true },
  { iso: 'PT', name: 'Portugal', nameAr: 'البرتغال', nationalityEn: 'Portuguese', nationalityAr: 'برتغالي', code: '+351', flag: '🇵🇹', placeholder: '912 345 678', isRtaExempted: true },
  { iso: 'GR', name: 'Greece', nameAr: 'اليونان', nationalityEn: 'Greek', nationalityAr: 'يوناني', code: '+30', flag: '🇬🇷', placeholder: '691 234 5678', isRtaExempted: true },
  { iso: 'TR', name: 'Turkey', nameAr: 'تركيا', nationalityEn: 'Turkish', nationalityAr: 'تركي', code: '+90', flag: '🇹🇷', placeholder: '532 123 4567', isRtaExempted: true },
  { iso: 'LU', name: 'Luxembourg', nameAr: 'لوكسمبورغ', nationalityEn: 'Luxembourgish', nationalityAr: 'لوكسمبورغي', code: '+352', flag: '🇱🇺', placeholder: '621 123 456', isRtaExempted: true },
  { iso: 'MC', name: 'Monaco', nameAr: 'موناكو', nationalityEn: 'Monegasque', nationalityAr: 'موناكي', code: '+377', flag: '🇲🇨', placeholder: '6 12 34 56 78', isRtaExempted: true },
  { iso: 'CY', name: 'Cyprus', nameAr: 'قبرص', nationalityEn: 'Cypriot', nationalityAr: 'قبرصي', code: '+357', flag: '🇨🇾', placeholder: '96 123456', isRtaExempted: true },
  { iso: 'CZ', name: 'Czech Republic', nameAr: 'التشيك', nationalityEn: 'Czech', nationalityAr: 'تشيكي', code: '+420', flag: '🇨🇿', placeholder: '601 123 456', isRtaExempted: true },
  { iso: 'SK', name: 'Slovakia', nameAr: 'سلوفاكيا', nationalityEn: 'Slovak', nationalityAr: 'سلوفاكي', code: '+421', flag: '🇸🇰', placeholder: '905 123 456', isRtaExempted: true },
  { iso: 'HU', name: 'Hungary', nameAr: 'المجر (هنغاريا)', nationalityEn: 'Hungarian', nationalityAr: 'مجري', code: '+36', flag: '🇭🇺', placeholder: '20 123 4567', isRtaExempted: true },
  { iso: 'RO', name: 'Romania', nameAr: 'رومانيا', nationalityEn: 'Romanian', nationalityAr: 'روماني', code: '+40', flag: '🇷🇴', placeholder: '721 234 567', isRtaExempted: true },
  { iso: 'BG', name: 'Bulgaria', nameAr: 'بلغاريا', nationalityEn: 'Bulgarian', nationalityAr: 'بلغاري', code: '+359', flag: '🇧🇬', placeholder: '87 123 4567', isRtaExempted: true },
  { iso: 'HR', name: 'Croatia', nameAr: 'كرواتيا', nationalityEn: 'Croatian', nationalityAr: 'كرواتي', code: '+385', flag: '🇭🇷', placeholder: '91 123 4567', isRtaExempted: true },
  { iso: 'RS', name: 'Serbia', nameAr: 'صربيا', nationalityEn: 'Serbian', nationalityAr: 'صربي', code: '+381', flag: '🇷🇸', placeholder: '64 123 4567', isRtaExempted: true },
  { iso: 'SI', name: 'Slovenia', nameAr: 'سلوفينيا', nationalityEn: 'Slovenian', nationalityAr: 'سلوفيني', code: '+386', flag: '🇸🇮', placeholder: '40 123 456', isRtaExempted: true },
  { iso: 'LT', name: 'Lithuania', nameAr: 'ليتوانيا', nationalityEn: 'Lithuanian', nationalityAr: 'ليتواني', code: '+370', flag: '🇱🇹', placeholder: '612 34567', isRtaExempted: true },
  { iso: 'LV', name: 'Latvia', nameAr: 'لاتفيا', nationalityEn: 'Latvian', nationalityAr: 'لاتفي', code: '+371', flag: '🇱🇻', placeholder: '21 234 567', isRtaExempted: true },
  { iso: 'EE', name: 'Estonia', nameAr: 'إستونيا', nationalityEn: 'Estonian', nationalityAr: 'إستوني', code: '+372', flag: '🇪🇪', placeholder: '512 3456', isRtaExempted: true },
  { iso: 'IS', name: 'Iceland', nameAr: 'آيسلندا', nationalityEn: 'Icelandic', nationalityAr: 'آيسلندي', code: '+354', flag: '🇮🇸', placeholder: '612 3456', isRtaExempted: true },

  // Asia & Oceania (RTA Approved)
  { iso: 'AU', name: 'Australia', nameAr: 'أستراليا', nationalityEn: 'Australian', nationalityAr: 'أسترالي', code: '+61', flag: '🇦🇺', placeholder: '412 345 678', isRtaExempted: true },
  { iso: 'NZ', name: 'New Zealand', nameAr: 'نيوزيلندا', nationalityEn: 'New Zealander', nationalityAr: 'نيوزيلندي', code: '+64', flag: '🇳🇿', placeholder: '21 123 4567', isRtaExempted: true },
  { iso: 'JP', name: 'Japan', nameAr: 'اليابان', nationalityEn: 'Japanese', nationalityAr: 'ياباني', code: '+81', flag: '🇯🇵', placeholder: '90 1234 5678', isRtaExempted: true },
  { iso: 'KR', name: 'South Korea', nameAr: 'كوريا الجنوبية', nationalityEn: 'South Korean', nationalityAr: 'كوري جنوبي', code: '+82', flag: '🇰🇷', placeholder: '10 1234 5678', isRtaExempted: true },
  { iso: 'SG', name: 'Singapore', nameAr: 'سنغافورة', nationalityEn: 'Singaporean', nationalityAr: 'سنغافوري', code: '+65', flag: '🇸🇬', placeholder: '8123 4567', isRtaExempted: true },
  { iso: 'HK', name: 'Hong Kong', nameAr: 'هونغ كونغ', nationalityEn: 'Hong Konger', nationalityAr: 'هونغ كونغي', code: '+852', flag: '🇭🇰', placeholder: '9123 4567', isRtaExempted: true },
  { iso: 'CN', name: 'China', nameAr: 'الصين', nationalityEn: 'Chinese', nationalityAr: 'صيني', code: '+86', flag: '🇨🇳', placeholder: '138 0013 8000', isRtaExempted: true },
  { iso: 'ZA', name: 'South Africa', nameAr: 'جنوب أفريقيا', nationalityEn: 'South African', nationalityAr: 'جنوب أفريقي', code: '+27', flag: '🇿🇦', placeholder: '71 123 4567', isRtaExempted: true },

  // Other Major Global Countries
  { iso: 'RU', name: 'Russia', nameAr: 'روسيا', nationalityEn: 'Russian', nationalityAr: 'روسي', code: '+7', flag: '🇷🇺', placeholder: '912 345 6789' },
  { iso: 'IN', name: 'India', nameAr: 'الهند', nationalityEn: 'Indian', nationalityAr: 'هندي', code: '+91', flag: '🇮🇳', placeholder: '98123 45678' },
  { iso: 'PK', name: 'Pakistan', nameAr: 'باكستان', nationalityEn: 'Pakistani', nationalityAr: 'باكستاني', code: '+92', flag: '🇵🇰', placeholder: '300 1234567' },
  { iso: 'BD', name: 'Bangladesh', nameAr: 'بنغلاديش', nationalityEn: 'Bangladeshi', nationalityAr: 'بنغالي', code: '+880', flag: '🇧🇩', placeholder: '1712 345678' },
  { iso: 'PH', name: 'Philippines', nameAr: 'الفلبين', nationalityEn: 'Filipino', nationalityAr: 'فلبيني', code: '+63', flag: '🇵🇭', placeholder: '917 123 4567' },
  { iso: 'ID', name: 'Indonesia', nameAr: 'إندونيسيا', nationalityEn: 'Indonesian', nationalityAr: 'إندونيسي', code: '+62', flag: '🇮🇩', placeholder: '812 3456 7890' },
  { iso: 'MY', name: 'Malaysia', nameAr: 'ماليزيا', nationalityEn: 'Malaysian', nationalityAr: 'ماليزي', code: '+60', flag: '🇲🇾', placeholder: '12 345 6789' },
  { iso: 'TH', name: 'Thailand', nameAr: 'تايلاند', nationalityEn: 'Thai', nationalityAr: 'تايلاندي', code: '+66', flag: '🇹🇭', placeholder: '81 234 5678' },
  { iso: 'VN', name: 'Vietnam', nameAr: 'فيتنام', nationalityEn: 'Vietnamese', nationalityAr: 'فيتنامي', code: '+84', flag: '🇻🇳', placeholder: '90 123 4567' },
  { iso: 'KZ', name: 'Kazakhstan', nameAr: 'كازاخستان', nationalityEn: 'Kazakh', nationalityAr: 'كازاخستاني', code: '+7', flag: '🇰🇿', placeholder: '701 234 5678' },
  { iso: 'UZ', name: 'Uzbekistan', nameAr: 'أوزبكستان', nationalityEn: 'Uzbek', nationalityAr: 'أوزبكي', code: '+998', flag: '🇺🇿', placeholder: '90 123 4567' },
  { iso: 'AZ', name: 'Azerbaijan', nameAr: 'أذربيجان', nationalityEn: 'Azerbaijani', nationalityAr: 'أذربيجاني', code: '+994', flag: '🇦🇿', placeholder: '50 123 4567' },
  { iso: 'GE', name: 'Georgia', nameAr: 'جورجيا', nationalityEn: 'Georgian', nationalityAr: 'جورجي', code: '+995', flag: '🇬🇪', placeholder: '591 12 34 56' },
  { iso: 'AM', name: 'Armenia', nameAr: 'أرمينيا', nationalityEn: 'Armenian', nationalityAr: 'أرميني', code: '+374', flag: '🇦🇲', placeholder: '91 123456' },
  { iso: 'UA', name: 'Ukraine', nameAr: 'أوكرانيا', nationalityEn: 'Ukrainian', nationalityAr: 'أوكراني', code: '+380', flag: '🇺🇦', placeholder: '50 123 4567' },
  { iso: 'BY', name: 'Belarus', nameAr: 'بيلاروسيا', nationalityEn: 'Belarusian', nationalityAr: 'بيلاروسي', code: '+375', flag: '🇧🇾', placeholder: '29 123 4567' },
  { iso: 'BR', name: 'Brazil', nameAr: 'البرازيل', nationalityEn: 'Brazilian', nationalityAr: 'برازيلي', code: '+55', flag: '🇧🇷', placeholder: '11 91234 5678' },
  { iso: 'MX', name: 'Mexico', nameAr: 'المكسيك', nationalityEn: 'Mexican', nationalityAr: 'مكسيكي', code: '+52', flag: '🇲🇽', placeholder: '55 1234 5678' },
  { iso: 'AR', name: 'Argentina', nameAr: 'الأرجنتين', nationalityEn: 'Argentine', nationalityAr: 'أرجنتيني', code: '+54', flag: '🇦🇷', placeholder: '9 11 1234 5678' },
  { iso: 'CL', name: 'Chile', nameAr: 'تشيلي', nationalityEn: 'Chilean', nationalityAr: 'تشيلي', code: '+56', flag: '🇨🇱', placeholder: '9 1234 5678' },
  { iso: 'CO', name: 'Colombia', nameAr: 'كولومبيا', nationalityEn: 'Colombian', nationalityAr: 'كولومبي', code: '+57', flag: '🇨🇴', placeholder: '300 123 4567' },
  { iso: 'NG', name: 'Nigeria', nameAr: 'نيجيريا', nationalityEn: 'Nigerian', nationalityAr: 'نيجيري', code: '+234', flag: '🇳🇬', placeholder: '803 123 4567' },
  { iso: 'KE', name: 'Kenya', nameAr: 'كينيا', nationalityEn: 'Kenyan', nationalityAr: 'كيني', code: '+254', flag: '🇰🇪', placeholder: '712 345678' },
  { iso: 'GH', name: 'Ghana', nameAr: 'غانا', nationalityEn: 'Ghanaian', nationalityAr: 'غاني', code: '+233', flag: '🇬🇭', placeholder: '24 123 4567' },
  { iso: 'ET', name: 'Ethiopia', nameAr: 'إثيوبيا', nationalityEn: 'Ethiopian', nationalityAr: 'إثيوبي', code: '+251', flag: '🇪🇹', placeholder: '91 123 4567' }
];

export const UAE_EMIRATES = [
  { id: 'Dubai', nameEn: 'Dubai', nameAr: 'دبي' },
  { id: 'Abu Dhabi', nameEn: 'Abu Dhabi', nameAr: 'أبوظبي' },
  { id: 'Sharjah', nameEn: 'Sharjah', nameAr: 'الشارقة' },
  { id: 'Ajman', nameEn: 'Ajman', nameAr: 'عجمان' },
  { id: 'Ras Al Khaimah', nameEn: 'Ras Al Khaimah', nameAr: 'رأس الخيمة' },
  { id: 'Fujairah', nameEn: 'Fujairah', nameAr: 'الفجيرة' },
  { id: 'Umm Al Quwain', nameEn: 'Umm Al Quwain', nameAr: 'أم القيوين' }
];

export const TRADE_LICENSE_ISSUING_AUTHORITIES = [
  { id: 'ded_dubai', nameAr: 'دائرة الاقتصاد والسياحة - دبي (DET / DED Dubai)', nameEn: 'Department of Economy and Tourism - Dubai (DET / DED)' },
  { id: 'jafza', nameAr: 'سلطة المنطقة الحرة بجبل علي (JAFZA Dubai)', nameEn: 'Jebel Ali Free Zone Authority (JAFZA)' },
  { id: 'dafza', nameAr: 'سلطة المنطقة الحرة بمطار دبي (DAFZA Dubai)', nameEn: 'Dubai Airport Freezone Authority (DAFZA)' },
  { id: 'dmcc', nameAr: 'مركز دبي للسلع المتعددة (DMCC Dubai)', nameEn: 'Dubai Multi Commodities Centre (DMCC)' },
  { id: 'difc', nameAr: 'سلطة مركز دبي المالي العالمي (DIFC)', nameEn: 'Dubai International Financial Centre (DIFC)' },
  { id: 'ifza_dsoa', nameAr: 'سلطة واحة دبي للسيليكون / إيفزا (IFZA / DSOA)', nameEn: 'Dubai Silicon Oasis / IFZA' },
  { id: 'diez', nameAr: 'سلطة دبي للمناطق الاقتصادية المتكاملة (DIEZ)', nameEn: 'Dubai Integrated Economic Zones Authority (DIEZ)' },
  { id: 'tecom', nameAr: 'مجموعة تيكوم دبي (مدينة دبي للإنترنت / للإعلام)', nameEn: 'TECOM Group (Internet City / Media City)' },
  { id: 'dmca', nameAr: 'سلطة مدينة دبي الملاحية (DMCA)', nameEn: 'Dubai Maritime City Authority' },
  { id: 'added_abudhabi', nameAr: 'دائرة التنمية الاقتصادية - أبوظبي (ADDED)', nameEn: 'Abu Dhabi Department of Economic Development (ADDED)' },
  { id: 'adgm', nameAr: 'سوق أبوظبي العالمي (ADGM)', nameEn: 'Abu Dhabi Global Market (ADGM)' },
  { id: 'twofour54', nameAr: 'twofour54 المنطقة الإعلامية أبوظبي', nameEn: 'twofour54 Abu Dhabi Media Zone' },
  { id: 'sedd_sharjah', nameAr: 'دائرة التنمية الاقتصادية - الشارقة (SEDD)', nameEn: 'Sharjah Economic Development Department (SEDD)' },
  { id: 'saif_zone', nameAr: 'هيئة المنطقة الحرة لمطار الشارقة الدولي (SAIF Zone)', nameEn: 'Sharjah Airport International Free Zone (SAIF)' },
  { id: 'hfza_sharjah', nameAr: 'هيئة المنطقة الحرة بالحمرية - الشارقة (HFZA)', nameEn: 'Hamriyah Free Zone Authority (HFZA)' },
  { id: 'rakez', nameAr: 'هيئة مناطق رأس الخيمة الاقتصادية (RAKEZ)', nameEn: 'Ras Al Khaimah Economic Zone (RAKEZ)' },
  { id: 'ajman_ded', nameAr: 'دائرة التنمية الاقتصادية - عجمان (Ajman DED)', nameEn: 'Ajman Department of Economic Development' },
  { id: 'afza_ajman', nameAr: 'منطقة عجمان الحرة (AFZA)', nameEn: 'Ajman Free Zone Authority (AFZA)' },
  { id: 'ffza_fujairah', nameAr: 'هيئة المنطقة الحرة بالفجيرة (FFZA)', nameEn: 'Fujairah Free Zone Authority (FFZA)' },
  { id: 'uaq_ded', nameAr: 'دائرة التنمية الاقتصادية - أم القيوين (UAQ DED)', nameEn: 'Umm Al Quwain Economic Development' },
  { id: 'other', nameAr: 'جهة إصدار أخرى (إدخال مخصص)', nameEn: 'Other Issuing Authority (Custom)' }
];

export const ID_ISSUING_AUTHORITIES = [
  { id: 'icp_uae', nameAr: 'الهيئة الاتحادية للهوية والجنسية والجمارك وأمن المنافذ (الإمارات ICP)', nameEn: 'Federal Authority for Identity, Citizenship, Customs and Port Security (ICP UAE)' },
  { id: 'moi_uae', nameAr: 'وزارة الداخلية - دولة الإمارات العربية المتحدة (MOI UAE)', nameEn: 'Ministry of Interior - UAE (MOI)' },
  { id: 'dubai_police', nameAr: 'القيادة العامة لشرطة دبي (Dubai Police)', nameEn: 'Dubai Police General HQ' },
  { id: 'moi_ksa', nameAr: 'وزارة الداخلية - المملكة العربية السعودية (Absher / MOI KSA)', nameEn: 'Ministry of Interior - Saudi Arabia' },
  { id: 'moi_qatar', nameAr: 'وزارة الداخلية - دولة قطر (MOI Qatar)', nameEn: 'Ministry of Interior - Qatar' },
  { id: 'moi_kuwait', nameAr: 'وزارة الداخلية - دولة الكويت (MOI Kuwait)', nameEn: 'Ministry of Interior - Kuwait' },
  { id: 'moi_bahrain', nameAr: 'شؤون الجنسية والجوازات والإقامة - البحرين (NPRA Bahrain)', nameEn: 'Nationality, Passports and Residence Affairs - Bahrain' },
  { id: 'rop_oman', nameAr: 'شرطة عمان السلطانية - الإدارة العامة للجوازات والإقامة', nameEn: 'Royal Oman Police - Passports & Residence' },
  { id: 'home_office_uk', nameAr: 'UK Home Office / HM Passport Office (المملكة المتحدة)', nameEn: 'HM Passport Office / Home Office (UK)' },
  { id: 'us_dept_state', nameAr: 'U.S. Department of State (الولايات المتحدة الأمريكية)', nameEn: 'U.S. Department of State (USA)' },
  { id: 'passport_canada', nameAr: 'Passport Canada / Immigration (كندا)', nameEn: 'Immigration, Refugees and Citizenship Canada' },
  { id: 'europe_official', nameAr: 'السلطات الحكومية الرسمية بالاتحاد الأوروبي (EU Authority)', nameEn: 'Official European National Passport Authority' },
  { id: 'moi_egypt', nameAr: 'مصلحة الجوازات والهجرة والجنسية - جمهورية مصر العربية', nameEn: 'Passports, Immigration & Nationality Authority (Egypt)' },
  { id: 'other_authority', nameAr: 'جهة إصدار رسمية أخرى (Other Country Authority)', nameEn: 'Other Official Country Authority' }
];

export const DRIVING_LICENSE_ISSUING_AUTHORITIES = [
  { id: 'rta_dubai', nameAr: 'هيئة الطرق والمواصلات - دبي (RTA Dubai)', nameEn: 'Roads and Transport Authority - Dubai (RTA)' },
  { id: 'itc_abudhabi', nameAr: 'مركز النقل المتكامل / شرطة أبوظبي (ITC Abu Dhabi)', nameEn: 'Integrated Transport Centre / Abu Dhabi Police' },
  { id: 'sharjah_police', nameAr: 'القيادة العامة لشرطة الشارقة - ترخيص الآليات والسائقين', nameEn: 'Sharjah Police - Vehicles & Drivers Licensing' },
  { id: 'ajman_police', nameAr: 'القيادة العامة لشرطة عجمان - قسم ترخيص السائقين', nameEn: 'Ajman Police - Drivers Licensing' },
  { id: 'rak_police', nameAr: 'القيادة العامة لشرطة رأس الخيمة - إدارة ترخيص الآليات والسائقين', nameEn: 'RAK Police - Vehicles & Drivers Licensing' },
  { id: 'fujairah_police', nameAr: 'القيادة العامة لشرطة الفجيرة - قسم الترخيص', nameEn: 'Fujairah Police - Licensing Dept.' },
  { id: 'uaq_police', nameAr: 'القيادة العامة لشرطة أم القيوين - قسم الترخيص', nameEn: 'UAQ Police - Licensing Dept.' },
  { id: 'traffic_ksa', nameAr: 'الإدارة العامة للمرور - المملكة العربية السعودية (Moror KSA)', nameEn: 'General Directorate of Traffic - Saudi Arabia' },
  { id: 'traffic_qatar', nameAr: 'الإدارة العامة للمرور - دولة قطر (Traffic Qatar)', nameEn: 'General Directorate of Traffic - Qatar' },
  { id: 'traffic_kuwait', nameAr: 'الإدارة العامة للمرور - دولة الكويت (Traffic Kuwait)', nameEn: 'General Traffic Department - Kuwait' },
  { id: 'traffic_bahrain', nameAr: 'الإدارة العامة للمرور - مملكة البحرين (Traffic Bahrain)', nameEn: 'General Directorate of Traffic - Bahrain' },
  { id: 'traffic_oman', nameAr: 'شرطة عمان السلطانية - الإدارة العامة للمرور', nameEn: 'Royal Oman Police - Traffic Directorate' },
  { id: 'dvla_uk', nameAr: 'Driver and Vehicle Licensing Agency (DVLA UK)', nameEn: 'Driver and Vehicle Licensing Agency (DVLA UK)' },
  { id: 'dmv_usa', nameAr: 'Department of Motor Vehicles (DMV USA)', nameEn: 'Department of Motor Vehicles (DMV USA)' },
  { id: 'ministry_transport_eu', nameAr: 'إدارات وهيئات المرور الوطنية الأوروبية (EU Traffic Authority)', nameEn: 'European National Transport Authority' },
  { id: 'other_traffic_dept', nameAr: 'إدارة مرور / هيئة نقل بدولة أخرى (Other Traffic Dept)', nameEn: 'Other Foreign Traffic Licensing Authority' }
];

export const COMPANY_DOC_TYPES = [
  { id: 'trade_license', nameAr: 'رخصة تجارية (Trade License)', nameEn: 'Trade License', required: true, icon: 'FileText' },
  { id: 'trn_certificate', nameAr: 'شهادة التسجيل الضريبي (VAT / TRN Certificate)', nameEn: 'Tax Registration Certificate', required: false, icon: 'ShieldCheck' },
  { id: 'owner_id', nameAr: 'هوية / جواز سفر المالك أو الشريك (Owner / Partner ID)', nameEn: 'Owner / Partner ID', required: false, icon: 'UserCheck' },
  { id: 'authorized_signatory_id', nameAr: 'هوية الشخص المفوض بالتوقيع (Authorized Signatory ID)', nameEn: 'Authorized Signatory ID', required: false, icon: 'FileCheck' },
  { id: 'receiver_driver_id', nameAr: 'هوية المستلم / السائق المفوض (Designated Driver / Receiver ID)', nameEn: 'Designated Driver / Receiver ID', required: false, icon: 'Car' },
  { id: 'moa_contract', nameAr: 'عقد تأسيس الشركة (Memorandum of Association - MOA)', nameEn: 'Memorandum of Association (MOA)', required: false, icon: 'FileCode' },
  { id: 'power_of_attorney', nameAr: 'وكالة رسمية / خطاب تفويض (Power of Attorney)', nameEn: 'Power of Attorney / Authorization Letter', required: false, icon: 'Award' },
  { id: 'company_bank_statement', nameAr: 'كشف حساب بنكي للشركة (Company Bank Statement)', nameEn: 'Company Bank Statement', required: false, icon: 'CreditCard' },
  { id: 'other_doc', nameAr: 'مستند أو وثيقة أخرى (Other Document)', nameEn: 'Other Document', required: false, icon: 'Paperclip' }
];

export const INDIVIDUAL_DOC_TYPES = [
  { id: 'emirates_id', nameAr: 'الهوية الإماراتية / الهوية الوطنية (Emirates ID / National ID)', nameEn: 'Emirates ID / National ID', required: true, icon: 'IdCard' },
  { id: 'passport', nameAr: 'جواز السفر الدولي (Passport Copy)', nameEn: 'Passport Copy', required: false, icon: 'FileText' },
  { id: 'driving_license', nameAr: 'رخصة القيادة الأصلية (Original Driving License)', nameEn: 'Original Driving License', required: true, icon: 'Car' },
  { id: 'international_license', nameAr: 'رخصة القيادة الدولية (International Driving Permit - IDP)', nameEn: 'International Driving Permit (IDP)', required: false, icon: 'Globe' },
  { id: 'residence_visa', nameAr: 'تأشيرة الإقامة / ختم الدخول (UAE Visa / Entry Stamp)', nameEn: 'UAE Residence Visa / Entry Stamp', required: false, icon: 'Stamp' },
  { id: 'proof_of_address', nameAr: 'إثبات العنوان / حجز الفندق (Proof of Address / Hotel Booking)', nameEn: 'Proof of Address / Hotel Booking', required: false, icon: 'Home' },
  { id: 'credit_card_copy', nameAr: 'بطاقة الائتمان / الضمان المالي (Credit Card Copy)', nameEn: 'Credit Card / Payment Guarantee', required: false, icon: 'CreditCard' },
  { id: 'other_doc', nameAr: 'مستند أو وثيقة أخرى (Other Document)', nameEn: 'Other Document', required: false, icon: 'Paperclip' }
];
