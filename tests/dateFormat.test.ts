/**
 * Date Formatting -- DD/MM/YYYY presentation + UTC-shift-safe date-only
 * parsing (Splendor OS 3.0, P3 legacy UX audit)
 * ==========================================================================
 *
 * `formatDate`/`formatDateLocalized` used to run every date-only string
 * (e.g. "2026-01-05", exactly what every <input type="date"> in this app
 * produces, and what invoice/charge due dates and KYC document expiry
 * dates are stored as) through `new Date(input)`, which parses it as UTC
 * midnight, then read the day/month/year back with local-timezone getters.
 * For any viewer or server west of UTC, that silently displayed the
 * PREVIOUS calendar day. This suite pins the fix (a date-only string is
 * read directly from its own digits, never through a timezone conversion)
 * against a runtime deliberately set to a timezone well west of UTC, so a
 * regression back to the old behavior would fail here even though this
 * whole app's real users and servers are normally in UTC+4.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  // America/Los_Angeles is UTC-8 (or UTC-7 in DST) -- worst-case direction
  // for the UTC-midnight-parsed-as-local-time bug this suite guards against.
  process.env.TZ = 'America/Los_Angeles';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('formatDate() -- date-only strings never shift a day backward in a western timezone', () => {
  it('formats a date-only string as DD/MM/YYYY using its own digits, not a UTC-midnight-then-local-time conversion', async () => {
    const { formatDate } = await import('../src/lib/dateFormat');
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026'); // the exact case that used to shift to 31/12/2025
  });

  it('still correctly converts a genuine timestamp to local wall-clock time for display', async () => {
    const { formatDate } = await import('../src/lib/dateFormat');
    // A real instant (contract startDateTime-style), not a calendar date --
    // this SHOULD reflect the viewer's local time, unlike a date-only string.
    expect(formatDate('2026-01-05T23:00:00.000Z')).toBe('05/01/2026'); // 23:00 UTC = 15:00 in UTC-8, still the 5th
    expect(formatDate('2026-01-05T02:00:00.000Z')).toBe('04/01/2026'); // 02:00 UTC = 18:00 the previous day in UTC-8 -- correctly local
  });

  it('returns empty string for missing or invalid input, never a garbage date', async () => {
    const { formatDate } = await import('../src/lib/dateFormat');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('not-a-date')).toBe('');
  });

  it('pads single-digit day and month with a leading zero', async () => {
    const { formatDate } = await import('../src/lib/dateFormat');
    expect(formatDate('2026-03-07')).toBe('07/03/2026');
  });
});

describe('formatDateLocalized() -- Arabic month names, same UTC-shift-safety', () => {
  it('formats a date-only string with the Arabic month name using its own digits', async () => {
    const { formatDateLocalized } = await import('../src/lib/dateFormat');
    expect(formatDateLocalized('2026-01-01', true)).toBe('01 يناير 2026');
    expect(formatDateLocalized('2026-12-31', true)).toBe('31 ديسمبر 2026');
  });

  it('falls back to formatDate for non-Arabic', async () => {
    const { formatDateLocalized } = await import('../src/lib/dateFormat');
    expect(formatDateLocalized('2026-06-15', false)).toBe('15/06/2026');
  });
});

describe('formatPhoneNumber()', () => {
  it('wraps the number in LTR isolation marks so it never flips in Arabic text', async () => {
    const { formatPhoneNumber } = await import('../src/lib/dateFormat');
    expect(formatPhoneNumber('+971 50 511 0410')).toBe('‪+971 50 511 0410‬');
  });

  it('returns empty string for missing input', async () => {
    const { formatPhoneNumber } = await import('../src/lib/dateFormat');
    expect(formatPhoneNumber(null)).toBe('');
    expect(formatPhoneNumber(undefined)).toBe('');
  });
});

describe('parseDayMonthYearToIso() -- DayMonthYearDateInput.tsx\'s parser', () => {
  it('parses DD/MM/YYYY and DD-MM-YYYY into canonical YYYY-MM-DD', async () => {
    const { parseDayMonthYearToIso } = await import('../src/lib/dateFormat');
    expect(parseDayMonthYearToIso('05/01/2026')).toBe('2026-01-05');
    expect(parseDayMonthYearToIso('31/12/2026')).toBe('2026-12-31');
    expect(parseDayMonthYearToIso('05-01-2026')).toBe('2026-01-05');
  });

  it('passes an already-ISO YYYY-MM-DD string through unchanged (normalized)', async () => {
    const { parseDayMonthYearToIso } = await import('../src/lib/dateFormat');
    expect(parseDayMonthYearToIso('2026-01-05')).toBe('2026-01-05');
    expect(parseDayMonthYearToIso('2026-1-5')).toBe('2026-01-05');
  });

  it('rejects a date that does not exist on the calendar, never silently rolling it over', async () => {
    const { parseDayMonthYearToIso } = await import('../src/lib/dateFormat');
    // 2026 is not a leap year -- February has 28 days.
    expect(parseDayMonthYearToIso('29/02/2026')).toBeNull();
    expect(parseDayMonthYearToIso('31/02/2026')).toBeNull();
    expect(parseDayMonthYearToIso('31/04/2026')).toBeNull(); // April has 30 days
  });

  it('accepts a real leap-year February 29th', async () => {
    const { parseDayMonthYearToIso } = await import('../src/lib/dateFormat');
    expect(parseDayMonthYearToIso('29/02/2028')).toBe('2028-02-29'); // 2028 is a leap year
  });

  it('rejects an out-of-range month or garbage input', async () => {
    const { parseDayMonthYearToIso } = await import('../src/lib/dateFormat');
    expect(parseDayMonthYearToIso('05/13/2026')).toBeNull();
    expect(parseDayMonthYearToIso('not a date')).toBeNull();
    expect(parseDayMonthYearToIso('')).toBeNull();
    expect(parseDayMonthYearToIso(null)).toBeNull();
    expect(parseDayMonthYearToIso(undefined)).toBeNull();
  });
});
