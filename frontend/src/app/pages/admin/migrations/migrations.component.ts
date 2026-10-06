import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { ApiError, ApiService, MigrationsApplyResult, MigrationsStatus } from '../../../core/api/api.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { BootService } from '../../../core/state/boot.service';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog/confirm-dialog.component';
import { adminErrorText } from '../admin-error';

/**
 * /admin/migrations (ADMIN alone; English) - the anotoki family's Migrations
 * page, the IAM's shape and words: the database schema is what the files in
 * backend/migrations/piano_academy/ build. Pending (in the order they will
 * run) and Applied (in the order they ran, with when - the server's
 * "2026-10-04 09:30", or its numbers in the order and clock the reader's
 * anotoki account chose: the localDate pipe's stamp), and "Apply pending" -
 * POST /api/admin/migrations/apply, under the one lock setup.php's Save and
 * `php migration.php` take too (409 busy while one of them runs). The files
 * run in order, each in its own transaction, and the run stops at the first
 * that fails - every migration assumes the ones before it ran - which is
 * rolled back whole and named, with what PostgreSQL said, word for word, as
 * the IAM's page shows it (the server logs it too).
 *
 * It works while the database is behind the code, when nothing else of the
 * app does: the app draws this page for an ADMIN then (the "not set up yet"
 * card links here), and once nothing is pending it starts the app where it
 * stands (BootService.resumeAfterUpdate()), this page and what it said kept.
 */
@Component({
  selector: 'app-migrations',
  templateUrl: './migrations.component.html',
  styleUrl: './migrations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, LocalDatePipe],
})
export class MigrationsComponent {
  private readonly api = inject(ApiService);
  private readonly boot = inject(BootService);
  private readonly confirm = viewChild.required(ConfirmDialogComponent);

  protected readonly status = signal<MigrationsStatus | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly applying = signal(false);
  /** What the last Apply did. */
  protected readonly result = signal<MigrationsApplyResult | null>(null);
  /** Apply was refused before anything ran: another update was running, the sign-in ended, the server was out of reach. */
  protected readonly applyError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      this.status.set(await this.api.migrations());
    } catch (error) {
      this.loadError.set(adminErrorText(error));
    }
  }

  protected async apply(): Promise<void> {
    const pending = this.status()?.pending.length ?? 0;
    const yes = await this.confirm().ask({
      title: pending === 1 ? 'Apply 1 pending migration?' : `Apply ${pending} pending migrations?`,
      message: 'They run now, against the live database, in order - stopping at the first one that fails. Make sure there is a fresh backup (pg_dump).',
      confirmLabel: 'Apply',
      danger: true,
    });
    if (!yes) return;

    this.applying.set(true);
    this.result.set(null);
    this.applyError.set(null);
    try {
      this.result.set(await this.api.applyMigrations());
    } catch (error) {
      this.applyError.set(
        error instanceof ApiError && error.code === 'busy'
          ? 'Another database update is running (another Apply, setup.php or php migration.php). Nothing was applied. Wait a moment, then look again.'
          : adminErrorText(error),
      );
    } finally {
      this.applying.set(false);
    }
    await this.load();
    if (this.status()?.pending.length === 0) {
      await this.boot.resumeAfterUpdate();
    }
  }
}
