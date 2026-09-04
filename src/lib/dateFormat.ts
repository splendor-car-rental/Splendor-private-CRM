/**
 * Centralized Date & Time Formatting Engine for Splendor Luxury CRM.
 *
 * Mandates:
 * 1. Every date across the entire CRM must strictly display in Day/Month/Year (DD/MM/YYYY) format,
 *    never in Month/Day/Year (MM/DD/YYYY).
 * 2. Phone numbers must strictly display the country code on the left side (dir="ltr")
 *    to prevent RTL digit transposition in Arabic text.
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A pure calendar date (no time-of-day component -- what every
 * `<input type="date">` in this app produces, and what invoice/charge
 * due dates, KYC document expiry dates, etc. are stored as) has no
 * timezone. `new Date('2026-01-05')` parses that as UTC midnight, and
 * reading it back with .getDate()/.getMonth()/.getFullYear() then applies
 * whichever local timezone the CODE HAPPENS TO RUN IN -- for a server or
 * browser west of UTC, that silently displays the PREVIOUS calendar day.
 * A calendar-date string is read directly from its own digits instead;
 * only a genuine timestamp (a full ISO instant, a Date, or a number) goes
 * through the Date constructor, where converting to local wall-clock time
 * for display is the actually-intended behavior.
 */
function extractCalendarDate(input: string | number | Date, timeZone?: string): { day: number; month: number; year: number } | null {
  if (typeof input === 'string' && DATE_ONLY_PATTERN.test(input)) {
    const [year, month, day] = input.split('-').map(Number);
    return { day, month, year };
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return null;
  if (timeZone) {
    // A real timestamp read in a specific timezone (e.g. server code
    // rendering a customer-facing message in UAE time regardless of the
    // host's own timezone) instead of the runtime's local getters.
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;
    return { day: parseInt(map.day, 10), month: parseInt(map.month, 10), year: parseInt(map.year, 10) };
  }
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

export function formatDate(input: string | number | Date | undefined | null, timeZone?: string): string {
  if (!input) return '';
  const parsed = extractCalendarDate(input, timeZone);
  if (!parsed) return '';
  const day = String(parsed.day).padStart(2, '0');
  const month = String(parsed.month).padStart(2, '0');
  return `${day}/${month}/${parsed.year}`;
}

export function formatDateTime(input: string | number | Date | undefined | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const datePart = formatDate(input);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

/**
 * Time-only (no date), 24-hour, zero-padded HH:MM -- for a chat/WhatsApp
 * message timestamp or a "last seen" indicator where only the clock time is
 * shown. A single fixed format everywhere this appears, instead of each
 * call site picking its own `toLocaleTimeString()` options (some already in
 * this codebase used 12-hour AM/PM, some 24-hour, inconsistently).
 */
export function formatTime(input: string | number | Date | undefined | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDateLocalized(input: string | number | Date | undefined | null, isAr = false): string {
  if (!input) return '';
  const parsed = extractCalendarDate(input);
  if (!parsed) return '';

  if (isAr) {
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const day = String(parsed.day).padStart(2, '0');
    const month = arabicMonths[parsed.month - 1];
    return `${day} ${month} ${parsed.year}`;
  }

  return formatDate(input);
}

export function formatDateTimeLocalized(input: string | number | Date | undefined | null, isAr = false): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const datePart = formatDate(input);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} - ${hours}:${minutes}`;
}

function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * Parses user-entered DD/MM/YYYY (or DD-MM-YYYY, or an already-ISO
 * YYYY-MM-DD) into a canonical YYYY-MM-DD date-only string, or null if the
 * input isn't a real calendar date. Rejects e.g. "31/02/2026" outright
 * rather than silently accepting it and letting a later `new Date()` call
 * roll it over to March -- the same calendar-correctness standard the rest
 * of this file (extractCalendarDate) already holds every date-only string
 * to, using UTC arithmetic so this never depends on the runtime's timezone.
 */
export function parseDayMonthYearToIso(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (!isValidCalendarDate(day, month, year)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    if (!isValidCalendarDate(day, month, year)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Ensures phone numbers display country code on the left without flipping in RTL.
 * E.g., "+971 50 511 0410"
 */
export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  // Isolate text with LTR mark so direction does not flip in Arabic
  return `\u202A${cleaned}\u202C`;
}
