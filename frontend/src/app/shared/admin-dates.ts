import { Injectable } from '@angular/core';

/**
 * How the admin panel writes its dates - People's, the Migrations page's and
 * the admin tools' (the family's pages take it as their `formatDate`:
 * shared/site-admin.ts, shared/state/site-migrations.ts). The way itself is
 * the admin panel's (sites/admin/admin-stamp.ts, on the family's dates):
 * its frame hands it over as it opens (sites/admin/app.component), so the
 * family's dates (@anotoki/lib/ui/dates) come with the panel's lazy chunk,
 * never with the first load. Every page that writes such a date is drawn in
 * that frame; before it opened, a date is written as it came.
 */
@Injectable({ providedIn: 'root' })
export class AdminDates {
  private writer: ((value: string) => string) | null = null;

  /** The admin frame's way of writing a date. */
  use(writer: (value: string) => string): void {
    this.writer = writer;
  }

  format(value: string): string {
    return this.writer ? this.writer(value) : value;
  }
}
