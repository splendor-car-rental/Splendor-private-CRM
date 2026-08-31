import type { VehicleCategory } from '../types';

/**
 * Static copy/config for the WhatsApp conversational flow -- category
 * labels, universal commands, and Meta Cloud API's own hard limits for
 * interactive messages. Kept in one file (matching the
 * inspectionPhotoCategories.ts precedent) so wording changes and Meta
 * limit changes never require touching the state-machine logic itself.
 */

export const WHATSAPP_CATEGORY_LABELS: Record<VehicleCategory, { en: string; ar: string }> = {
  economy_sedan: { en: 'Economy Sedans', ar: 'سيدان اقتصادي' },
  economy_hatchback: { en: 'Economy Hatchbacks', ar: 'هاتشباك اقتصادي' },
  compact_suv: { en: 'Compact SUVs & Crossovers', ar: 'كروس أوفر مدمج' },
  midsize_suv: { en: 'Midsize & Family SUVs', ar: 'SUV عائلي ومتوسط' },
  business_sedan: { en: 'Business & Midsize Sedans', ar: 'سيدان أعمال' },
  family_van: { en: 'Family Vans & MPVs', ar: 'فان وعائلية' },
  supercar: { en: 'Supercars', ar: 'سيارات سوبر' },
  ultra_luxury_sedan: { en: 'Ultra-Luxury Sedans', ar: 'سيدان فائقة الفخامة' },
  executive_suv: { en: 'Executive SUVs', ar: 'دفع رباعي تنفيذي' },
  grand_tourer: { en: 'Grand Tourers', ar: 'سيارات جراند تورر' },
  exotic_convertible: { en: 'Exotic Convertibles', ar: 'مكشوفة استثنائية' }
};

export const ALL_VEHICLE_CATEGORIES: VehicleCategory[] = [
  'economy_sedan', 'economy_hatchback', 'compact_suv', 'midsize_suv', 'business_sedan', 'family_van',
  'supercar', 'ultra_luxury_sedan', 'executive_suv', 'grand_tourer', 'exotic_convertible'
];

/**
 * Free-text commands recognized in ANY conversation state as an escape
 * hatch -- a customer must always be able to reset or ask for a human, no
 * matter how deep in the flow they are (mission's explicit failure-handling
 * + human-concierge requirements). Matched case-insensitively against the
 * whole trimmed message body.
 */
export const RESTART_COMMANDS = ['menu', 'قائمة', 'restart', 'ابدأ', 'بداية', 'start'];
export const HUMAN_HELP_COMMANDS = ['human', 'agent', 'موظف', 'مساعدة', 'support', 'مندوب'];

/** Row/button ids exchanged with Meta's interactive messages -- stable string contracts between what we send and what we parse back from an interactive reply. */
export const WHATSAPP_ACTION_IDS = {
  HUMAN_HELP: 'human_help',
  CONFIRM_RESERVATION: 'confirm_reservation',
  CANCEL_RESERVATION: 'cancel_reservation',
  CATEGORY_PREFIX: 'category:',
  VEHICLE_PREFIX: 'vehicle:'
} as const;

/**
 * Meta WhatsApp Cloud API's own documented hard limits for interactive
 * messages (Meta for Developers -- Cloud API Reference, Interactive
 * Messages). Sending a payload that violates these is rejected by Meta at
 * the API level -- these are enforced client-side (src/server/whatsapp.ts)
 * so a bug here fails fast and locally instead of surfacing as a cryptic
 * Graph API error at send time.
 */
export const META_INTERACTIVE_LIMITS = {
  MAX_BUTTONS: 3,
  MAX_BUTTON_TITLE_CHARS: 20,
  MAX_LIST_BUTTON_TEXT_CHARS: 20,
  MAX_LIST_ROWS_TOTAL: 10,
  MAX_LIST_ROW_TITLE_CHARS: 24,
  MAX_LIST_ROW_DESCRIPTION_CHARS: 72,
  MAX_LIST_SECTION_TITLE_CHARS: 24
} as const;
