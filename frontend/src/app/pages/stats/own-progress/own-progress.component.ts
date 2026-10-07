import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { ApiError, ApiService, EXPORT_LIMIT, ImportPreview, ImportResult, ProgressCounts } from '../../../core/api/api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslatePluralPipe } from '../../../core/i18n/translate-plural.pipe';
import { TranslationParams, TranslationService } from '../../../core/i18n/translation.service';
import { ProgressStore } from '../../../core/state/progress-store.service';
import { saveFile } from '../../../core/util/save-file';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog/confirm-dialog.component';

/** The size limit in the learner's words: whole megabytes (EXPORT_LIMIT is 5 MiB). */
const LIMIT_MB = Math.round(EXPORT_LIMIT / (1024 * 1024));

/** Something that did not work: a key (and its numbers) - worded in the template, never the server's sentence. */
export interface OwnProgressProblem {
  key: string;
  params?: TranslationParams;
}

/**
 * The key for a call of the own progress file that did not work, from its
 * code (or status) - a table, never the code itself.
 */
export function ownProgressProblem(error: unknown): OwnProgressProblem {
  if (!(error instanceof ApiError)) return { key: 'ownProgress.error.failed' };
  if (error.wrongUser) return { key: 'ownProgress.error.otherPerson' };
  if (error.status === 0) return { key: 'ownProgress.error.offline' };
  if (error.status === 401) return { key: 'ownProgress.error.signedOut' };
  switch (error.code) {
    case 'not_an_export':
      return { key: 'ownProgress.error.notAnExport' };
    case 'invalid_export':
      return { key: 'ownProgress.error.invalidExport' };
    case 'too_large':
      return { key: 'ownProgress.error.tooLarge', params: { megabytes: LIMIT_MB } };
    case 'export_too_large':
      return { key: 'ownProgress.error.exportTooLarge', params: { megabytes: LIMIT_MB } };
    // The site is not ready - an update waits, or it is not set up: "being updated right now".
    case 'not_set_up':
    case 'update_pending':
      return { key: 'ownProgress.error.notSetUp' };
  }
  return error.status === 413 ? { key: 'ownProgress.error.tooLarge', params: { megabytes: LIMIT_MB } } : { key: 'ownProgress.error.failed' };
}

/** A file that was chosen, read, and looked at by the server (the dry run): what it would do. */
interface Looked {
  text: string;
  preview: ImportPreview;
}

/**
 * "Your progress file", at the end of Stats: each person's own progress as a
 * file, and back.
 *
 * - Download: GET /api/me/export, saved by the browser under the name the
 *   server gave (piano-academy-progress-YYYY-MM-DD.json).
 * - Bring back a file: the file is checked for its size here (EXPORT_LIMIT -
 *   nothing bigger is sent), refused while some progress is not saved yet (a
 *   save waiting would be refused after the import anyway), then the server
 *   looks at it without writing anything (the dry run): what is saved now and
 *   what the file brings. Bringing it in is a second press - and when there
 *   is progress, it replaces it, never mixes, so a question names that first.
 *   After it the page loads the progress again (the import started a new
 *   generation of it) and tells the person's other tabs to.
 *
 * Every refusal is worded from its code (ownProgressProblem()); the server's
 * sentence is never shown to a learner.
 */
@Component({
  selector: 'app-own-progress',
  templateUrl: './own-progress.component.html',
  styleUrl: './own-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, TranslatePluralPipe, ConfirmDialogComponent],
})
export class OwnProgressComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(ProgressStore);
  private readonly i18n = inject(TranslationService);
  private readonly confirm = viewChild.required(ConfirmDialogComponent);

  /** What is under way: a download, reading and looking at a file, bringing one in. */
  protected readonly busy = signal<'download' | 'look' | 'import' | null>(null);
  protected readonly problem = signal<OwnProgressProblem | null>(null);
  protected readonly looked = signal<Looked | null>(null);
  protected readonly done = signal<ImportResult | null>(null);
  /** The page took the file, but could not load the progress again: the page has to be loaded again. */
  protected readonly reloadFailed = signal(false);

  /** The counts in words, in a computed(): they follow the language. */
  protected readonly now = computed(() => this.counted(this.looked()?.preview.current));
  protected readonly incoming = computed(() => this.counted(this.looked()?.preview.incoming));
  protected readonly brought = computed(() => this.counted(this.done() ?? undefined));

  private counted(counts: ProgressCounts | undefined): string {
    if (!counts) return '';
    return [
      this.i18n.plural('ownProgress.count.notes', counts.notes),
      this.i18n.plural('ownProgress.count.steps', counts.steps),
      this.i18n.plural('ownProgress.count.rounds', counts.sessions),
    ].join(', ');
  }

  private start(what: 'download' | 'look' | 'import'): void {
    this.busy.set(what);
    this.problem.set(null);
    this.done.set(null);
    this.reloadFailed.set(false);
  }

  protected async download(): Promise<void> {
    if (this.busy()) return;
    this.start('download');
    this.looked.set(null);
    try {
      const file = await this.api.exportMyProgress();
      saveFile(file.name, file.text, 'application/json');
    } catch (error) {
      this.problem.set(ownProgressProblem(error));
    } finally {
      this.busy.set(null);
    }
  }

  /** A file was chosen: check it here, then let the server look at it (nothing is written). */
  protected async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // The same file may be chosen again after a refusal.
    input.value = '';
    if (!file || this.busy()) return;
    this.looked.set(null);
    this.start('look');
    try {
      if (file.size > EXPORT_LIMIT) {
        this.problem.set({ key: 'ownProgress.error.tooLarge', params: { megabytes: LIMIT_MB } });
        return;
      }
      if (this.store.hasUnsaved()) {
        this.problem.set({ key: 'ownProgress.error.unsaved' });
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        this.problem.set({ key: 'ownProgress.error.unreadable' });
        return;
      }
      this.looked.set({ text, preview: await this.api.previewImport(text) });
    } catch (error) {
      this.problem.set(ownProgressProblem(error));
    } finally {
      this.busy.set(null);
    }
  }

  protected cancel(): void {
    this.looked.set(null);
  }

  /** The second press: in it comes - over progress only after the question said yes. */
  protected async bringIn(): Promise<void> {
    const looked = this.looked();
    if (!looked || this.busy()) return;
    const replace = looked.preview.hasProgress;
    if (replace && !(await this.confirm().ask(this.replaceQuestion()))) return;
    if (this.store.hasUnsaved()) {
      this.problem.set({ key: 'ownProgress.error.unsaved' });
      return;
    }
    this.start('import');
    try {
      const result = await this.api.importMyProgress(looked.text, replace);
      this.looked.set(null);
      this.done.set(result);
      // The import started a new generation: load it (the saves name it from now on), and tell the other tabs.
      this.store.announceReplaced();
      try {
        await this.store.reloadFromServer();
      } catch {
        this.reloadFailed.set(true);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'has_progress') {
        // Progress came in meanwhile (another tab, another computer): show it, and ask before replacing it.
        const current = error.details?.['current'] as ProgressCounts | undefined;
        this.looked.set({ text: looked.text, preview: { ...looked.preview, hasProgress: true, current: current ?? looked.preview.current } });
        this.problem.set({ key: 'ownProgress.error.hasProgressNow' });
      } else {
        this.problem.set(ownProgressProblem(error));
      }
    } finally {
      this.busy.set(null);
    }
  }

  private replaceQuestion() {
    return {
      title: this.i18n.t('ownProgress.confirm.title'),
      message: this.i18n.t('ownProgress.confirm.text'),
      confirmLabel: this.i18n.t('ownProgress.confirm.yes'),
      cancelLabel: this.i18n.t('ownProgress.confirm.no'),
      danger: true,
    };
  }
}
