import { type AnotokiDates, type DateValue, formatDateTime } from '@anotoki/lib/ui/dates';

/**
 * The admin panel's dates: "2026-10-20 18:05" - a day in numbers, year
 * first, and the time on the 24-hour clock, in the reader's time zone - what
 * People, the Migrations page and the admin tools always showed. Where the
 * anotoki account chose a date order or a clock, they stand in its place
 * ("20.10.2026 6:05 pm"), as on every page of the family. The family's
 * dates write it (@anotoki/lib/ui/dates' formatDateTime(), in the page's
 * locale - English in the admin panel): the order and the clock the account
 * left to the language are this fixed pair here. Nothing is ''; a text that
 * is no date comes back as it is.
 *
 * The admin panel's own: its frame hands it to shared/admin-dates.ts as it
 * opens, and nothing of the first load imports it - the family's dates come
 * with the panel's chunk.
 */
export function adminStamp(value: DateValue, dates: Pick<AnotokiDates, 'writing'>): string {
  const writing = dates.writing();
  return formatDateTime(value, {
    locale: writing.locale,
    choices: { date_format: writing.choices?.date_format ?? 'ymd_dash', time_format: writing.choices?.time_format ?? '24' },
  });
}
