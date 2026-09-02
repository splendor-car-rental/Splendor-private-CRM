/**
 * Centralized Date & Time Formatting Engine for Splendor Luxury CRM.
 *
 * Mandates:
 * 1. Every human-facing calendar date is rendered Day/Month/Year (DD/MM/YYYY).
 * 2. Date-only values (YYYY-MM-DD) are calendar dates, not UTC instants; they
 *    must never shift to the previous/next day because of timezone parsing.
 * 3. Phone numbers display the country code on the left in RTL interfaces.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  day: string;
  month: string;
  year: string;
}

function dateOnlyParts(value: string): DateParts | null {
  const match = value.trim().match(DATE_ONLY_RE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) return null;
  return { day: match[3], month: match[2], year: match[1] };
}

function toDate(input: string | number | Date): Date | null {
  if (typeof input === 'string') {
    const parts = dateOnlyParts(input);
    if (parts) {
      const d = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(input: string | number | Date | undefined | null): string {
  if (input === undefined || input === null || input === '') return '';
  if (typeof input === 'string') {
    const parts = dateOnlyParts(input);
    if (parts) return `${parts.day}/${parts.month}/${parts.year}`;
  }
  const d = toDate(input);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(input: string | number | Date | undefined | null): string {
  if (input === undefined || input === null || input === '') return '';
  const d = toDate(input);
  if (!d) return '';
  const datePart = formatDate(input);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

export function formatDateLocalized(input: string | number | Date | undefined | null, isAr = false): string {
  if (input === undefined || input === null || input === '') return '';
  const datePart = formatDate(input);
  if (!datePart) return '';
  if (!isAr) return datePart;

  const [day, monthNumber, year] = datePart.split('/');
  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const month = arabicMonths[Number(monthNumber) - 1];
  return month ? `${day} ${month} ${year}` : datePart;
}

export function formatDateTimeLocalized(input: string | number | Date | undefined | null, isAr = false): string {
  if (input === undefined || input === null || input === '') return '';
  const d = toDate(input);
  if (!d) return '';
  const datePart = formatDateLocalized(input, isAr);
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
  return `\u202A${cleaned}\u202C`;
}
