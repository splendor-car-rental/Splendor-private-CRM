// Centralized date formatting -- the business owner asked for every date in
// the system to read Day/Month/Year (DD/MM/YYYY), not the browser's default
// locale format (which on an en-US browser renders MM/DD/YYYY and reads
// backwards for a Dubai-based team). Use formatDate()/formatDateTime()
// anywhere a date is shown to a user instead of calling
// .toLocaleDateString() directly, so the whole app stays consistent.

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
