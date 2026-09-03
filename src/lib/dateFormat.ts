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
function extractCalendarDate(input: string | number | Date): { day: number; month: number; year: number } | null {
  if (typeof input === 'string' && DATE_ONLY_PATTERN.test(input)) {
    const [year, month, day] = input.split('-').map(Number);
    return { day, month, year };
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return null;
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

export function formatDate(input: string | number | Date | undefined | null): string {
  if (!input) return '';
  const parsed = extractCalendarDate(input);
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
