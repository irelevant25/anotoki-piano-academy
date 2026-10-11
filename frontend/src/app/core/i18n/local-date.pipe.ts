import { Pipe, PipeTransform, inject } from '@angular/core';
import { AnotokiAuth, type AnotokiPreferences } from '@anotoki/lib/auth';
import { TranslationService } from '@anotoki/lib/translations';
import { formatClock, formatDatePattern } from './date-patterns';

/** A day in full, a day with its time, or the admin panel's stamp of numbers. */
export type LocalDateStyle = 'day' | 'moment' | 'stamp';

/** The language's own way of writing each: a day, a moment - and a moment's day and time apart, for beside an account's chosen order or clock. */
const FORMATS = {
  // "20 October 2026" / "20. októbra 2026" - the changelog dialog's release days.
  day: { day: 'numeric', month: 'long', year: 'numeric' },
  // "20 Oct 2026, 18:05" / "20. 10. 2026, 18:05" - when a session of the Stats table was played.
  moment: { dateStyle: 'medium', timeStyle: 'short' },
  // "20 Oct 2026" / "20. 10. 2026", and "18:05": the halves of a moment.
  momentDay: { dateStyle: 'medium' },
  momentTime: { timeStyle: 'short' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const DATE_FORMATS = new Map<string, Intl.DateTimeFormat>();

/** "2026-10-04 09:30": numbers a server wrote on its own clock (the Migrations page's, before it was the family's) - kept as they are, never moved into another time zone. */
const SERVER_CLOCK = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/**
 * `{{ iso | localDate: 'day' }}`: a date or a moment, written the way the
 * language on the page writes it - through `Intl`, in the learner's own time
 * zone. It takes the place of toLocaleDateString() and toLocaleString(), which
 * follow the browser's language whatever the page is in.
 *
 * A signed-in person's own date order and clock (the account's, which every
 * anotoki site follows - AnotokiAuth.preferences) win over the language's:
 * "6.10.2026" for a day, "6.10.2026 2:30 pm" for a moment - a date and a time
 * side by side once either is chosen, each half the language's own where it
 * is not. Nobody signed in (a visitor), or nothing chosen: as before.
 *
 * `stamp` is the admin panel's: "2026-10-20 18:05", numbers in a fixed order
 * (yyyy-MM-dd HH:mm) - what People and Migrations always showed - or the
 * account's order and clock in their place. An instant (People's, the
 * Migrations page's "2026-10-06T10:01:02Z") is written in the reader's time
 * zone; a server's own "2026-10-04 09:30" keeps its numbers.
 *
 * A calendar day (`2026-10-20`, a release's day) is that day wherever the
 * reader is - not midnight UTC. Nothing gives nothing; what is not a date
 * comes back as it came.
 *
 * Impure, like the translate pipe: the language - and the account's choices -
 * change under the same value.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly _i18n = inject(TranslationService);
  private readonly _auth = inject(AnotokiAuth);

  transform(value: string | null | undefined, style: LocalDateStyle = 'day'): string {
    return localDateText(value, style, this._i18n.locale(), this._auth.preferences());
  }
}

/**
 * What the pipe writes, for a date written outside a template of the app's
 * own: the family's Migrations page (@anotoki/lib) takes the app's way of
 * writing its dates as a function (core/state/site-migrations.ts). `locale`
 * is the language's for Intl, `chosen` the account's choices (or null).
 */
export function localDateText(value: string | null | undefined, style: LocalDateStyle, locale: string, chosen: AnotokiPreferences | null): string {
  if (!value) {
    return '';
  }
  if (style === 'stamp') {
    return stamp(value, locale, chosen);
  }
  const date = dateFrom(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  if (style === 'day') {
    return chosen?.date_format ? formatDatePattern(date, chosen.date_format) : dateFormat(locale, 'day').format(date);
  }
  // Neither chosen: the language's own way of putting the two together.
  if (!chosen?.date_format && !chosen?.time_format) {
    return dateFormat(locale, 'moment').format(date);
  }
  const day = chosen.date_format ? formatDatePattern(date, chosen.date_format) : dateFormat(locale, 'momentDay').format(date);
  const time = chosen.time_format ? formatClock(date, locale, chosen.time_format) : dateFormat(locale, 'momentTime').format(date);
  return `${day} ${time}`;
}

/** A calendar day is taken as that day at noon here; anything else as the moment it names. */
function dateFrom(value: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : new Date(value);
}

/**
 * The admin panel's stamp. The server's clock ("2026-10-04 09:30") is read as
 * UTC numbers and written as UTC numbers, so they come out as they went in
 * (and as they are, when nothing is chosen); an instant (People's
 * "2026-10-01T10:00:00.000Z") in the reader's time zone, as the date pipe
 * wrote it before.
 */
function stamp(value: string, locale: string, chosen: AnotokiPreferences | null): string {
  const written = SERVER_CLOCK.exec(value);
  if (written && !chosen?.date_format && !chosen?.time_format) {
    return value;
  }
  const utc = written !== null;
  const date = written ? new Date(Date.UTC(Number(written[1]), Number(written[2]) - 1, Number(written[3]), Number(written[4]), Number(written[5]))) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (number: number): string => String(number).padStart(2, '0');
  const day = chosen?.date_format
    ? formatDatePattern(date, chosen.date_format, utc)
    : utc
      ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
      : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = chosen?.time_format
    ? formatClock(date, locale, chosen.time_format, utc)
    : utc
      ? `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
      : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${day} ${time}`;
}

function dateFormat(locale: string, style: keyof typeof FORMATS): Intl.DateTimeFormat {
  const key = `${locale}|${style}`;
  let format = DATE_FORMATS.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, FORMATS[style]);
    DATE_FORMATS.set(key, format);
  }
  return format;
}
