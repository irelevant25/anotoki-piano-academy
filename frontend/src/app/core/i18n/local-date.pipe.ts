import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';

/** A day in full, or a day with its time. */
export type LocalDateStyle = 'day' | 'moment';

const FORMATS: Record<LocalDateStyle, Intl.DateTimeFormatOptions> = {
  // "20 October 2026" / "20. októbra 2026" - the changelog dialog's release days.
  day: { day: 'numeric', month: 'long', year: 'numeric' },
  // "20 Oct 2026, 18:05" / "20. 10. 2026, 18:05" - when a session of the Stats table was played.
  moment: { dateStyle: 'medium', timeStyle: 'short' },
};

const DATE_FORMATS = new Map<string, Intl.DateTimeFormat>();

/**
 * `{{ iso | localDate: 'day' }}`: a date or a moment, written the way the
 * language on the page writes it - through `Intl`, in the learner's own time
 * zone. It takes the place of toLocaleDateString() and toLocaleString(), which
 * follow the browser's language whatever the page is in.
 *
 * A calendar day (`2026-10-20`, a release's day) is that day wherever the
 * reader is - not midnight UTC. Nothing gives nothing; what is not a date
 * comes back as it came.
 *
 * Impure, like the translate pipe: the language changes under the same value.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly _i18n = inject(TranslationService);

  transform(value: string | null | undefined, style: LocalDateStyle = 'day'): string {
    if (!value) {
      return '';
    }
    const date = dateFrom(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return dateFormat(this._i18n.locale(), style).format(date);
  }
}

/** A calendar day is taken as that day at noon here; anything else as the moment it names. */
function dateFrom(value: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : new Date(value);
}

function dateFormat(locale: string, style: LocalDateStyle): Intl.DateTimeFormat {
  const key = `${locale}|${style}`;
  let format = DATE_FORMATS.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, FORMATS[style]);
    DATE_FORMATS.set(key, format);
  }
  return format;
}
