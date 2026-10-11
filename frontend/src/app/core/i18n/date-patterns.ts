import { type AnotokiDateFormat, type AnotokiTimeFormat } from '@anotoki/lib/auth';

/**
 * The account's date formats and clock (the IAM's migration 015) - the
 * anotoki family's one vocabulary, as the IAM's own pages write it
 * (../anotoki-iam/frontend/src/app/core/i18n/date-patterns.ts): a date in a
 * fixed order of numbers, and the clock with or without am/pm. "Automatic"
 * (null) is the page language's own way, which the callers keep
 * (local-date.pipe.ts).
 *
 * `utc` is this app's addition, for a time the server wrote as numbers on its
 * own clock (the Migrations page's "2026-10-04 09:30"): those numbers are put
 * in the chosen order as they are, never moved into the reader's time zone.
 */

/** A date in one of the fixed orders: 6.10.2026, 06/10/2026, 10/06/2026, 2026-10-06 - in the browser's time zone, or as UTC numbers. */
export function formatDatePattern(date: Date, format: AnotokiDateFormat, utc = false): string {
  const day = utc ? date.getUTCDate() : date.getDate();
  const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const pad = (value: number): string => String(value).padStart(2, '0');

  switch (format) {
    case 'dmy_dot':
      return `${day}.${month}.${year}`;
    case 'dmy_slash':
      return `${pad(day)}/${pad(month)}/${year}`;
    case 'mdy_slash':
      return `${pad(month)}/${pad(day)}/${year}`;
    case 'ymd_dash':
      return `${year}-${pad(month)}-${pad(day)}`;
  }
}

const clockCache = new Map<string, Intl.DateTimeFormat>();

/** The time of day on the chosen clock, in the page language's words for am and pm: 14:30, or 2:30 PM ("2:30 pm" in British English). */
export function formatClock(date: Date, locale: string, clock: AnotokiTimeFormat, utc = false): string {
  const key = `${locale}|${clock}|${utc ? 'utc' : 'here'}`;
  let format = clockCache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      ...(clock === '12' ? { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      ...(utc ? { timeZone: 'UTC' } : {}),
    });
    clockCache.set(key, format);
  }
  return format.format(date);
}
