import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { ApiError, ApiService, PeopleList, Person } from '../../../core/api/api.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { VISITOR_KEEP_DAYS } from '../../../core/i18n/visitor-words';
import { ProgressStore } from '../../../core/state/progress-store.service';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog/confirm-dialog.component';
import { adminErrorText } from '../admin-error';

/**
 * People (ADMIN alone; English, as the whole admin panel): everybody who
 * signed in and whom the app keeps anything of - their IAM id and username, when they were first and
 * last seen (2026-10-01 12:00, or in the order and clock the reader's anotoki account chose -
 * the localDate pipe's stamp), how many notes, steps of the path and rounds it keeps - and
 * "Delete their progress", after a question that names the person and the
 * counts. A delete takes everything the app keeps of them (the server's
 * DELETE /api/admin/people/{id}); their open tabs are refused their next
 * save (409 progress_changed) and load what is there now - nothing.
 *
 * Visitors (people practising without signing in, while the IAM does not
 * require it) are only counted, in a line under the list, with their rounds:
 * they have no name to list, and they go by themselves 30 days after their
 * last visit (VISITOR_KEEP_DAYS).
 *
 * Deleting oneself is allowed: this tab then loads its own (empty) progress
 * at once, and tells the person's other tabs.
 */
@Component({
  selector: 'app-people',
  templateUrl: './people.component.html',
  styleUrl: './people.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocalDatePipe, ConfirmDialogComponent],
})
export class PeopleComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(ProgressStore);
  private readonly confirm = viewChild.required(ConfirmDialogComponent);

  protected readonly people = signal<Person[] | null>(null);
  /** How many visitors there are, and their rounds (null until loaded). */
  protected readonly visitors = signal<PeopleList['visitors'] | null>(null);
  protected readonly keepDays = VISITOR_KEEP_DAYS;
  protected readonly loadError = signal<string | null>(null);
  /** The id being deleted, while it is. */
  protected readonly deleting = signal<number | null>(null);
  /** A delete that did not work, by the person's id. */
  protected readonly errors = signal<Record<number, string>>({});
  /** What the last delete did. */
  protected readonly happened = signal<string | null>(null);
  /** The signed-in person's own IAM id, to mark their row. */
  protected readonly me = signal(Number(this.api.dataOwner()));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      const list = await this.api.people();
      this.people.set(list.people);
      this.visitors.set(list.visitors);
    } catch (error) {
      this.loadError.set(adminErrorText(error));
    }
  }

  protected async remove(person: Person): Promise<void> {
    const name = person.username ?? `the person with IAM id ${person.id}`;
    const yes = await this.confirm().ask({
      title: `Delete the progress of ${name}?`,
      message:
        `Everything Piano Academy keeps of ${name} goes: ${person.notes} notes, ${person.steps} steps of the path and ${person.sessions} rounds. ` +
        'It cannot be brought back. Their anotoki account stays; if they sign in again, they start from nothing.',
      confirmLabel: 'Delete their progress',
      danger: true,
    });
    if (!yes) return;

    this.deleting.set(person.id);
    this.happened.set(null);
    this.errors.update((all) => Object.fromEntries(Object.entries(all).filter(([id]) => Number(id) !== person.id)));
    try {
      await this.api.deletePerson(person.id);
      this.people.update((list) => (list ?? []).filter((p) => p.id !== person.id));
      this.happened.set(`The progress of ${name} was deleted.`);
      if (person.id === this.me()) {
        // One's own: this tab loads the (empty) progress now, and the other tabs are told.
        this.store.announceReplaced();
        this.store.reloadFromServer().catch(() => this.store.changedElsewhere.set(true));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // Gone already - deleted in another tab, or by another administrator.
        this.people.update((list) => (list ?? []).filter((p) => p.id !== person.id));
        this.happened.set(`${name} was not there any more: nothing was deleted.`);
      } else {
        this.errors.update((all) => ({ ...all, [person.id]: adminErrorText(error) }));
      }
    } finally {
      this.deleting.set(null);
    }
  }
}
