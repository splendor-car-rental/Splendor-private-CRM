/**
 * Centralized Date & Time Formatting Engine for Splendor Luxury CRM.
 * 
 * Mandates:
 * 1. Every date across the entire CRM must strictly display in Day/Month/Year (DD/MM/YYYY) format,
 *    never in Month/Day/Year (MM/DD/YYYY).
 * 2. Phone numbers must strictly display the country code on the left side (dir="ltr")
 *    to prevent RTL digit transposition in Arabic text.
 */

export function formatDate(input: string | number | Date | undefined | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(input: string | number | Date | undefined | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const datePart = formatDate(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

export function formatDateLocalized(input: string | number | Date | undefined | null, isAr = false): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  
  if (isAr) {
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const day = String(d.getDate()).padStart(2, '0');
    const month = arabicMonths[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }
  
  return formatDate(d);
}

export function formatDateTimeLocalized(input: string | number | Date | undefined | null, isAr = false): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const datePart = formatDate(d);
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
