import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api/api.service';
import { LanguageChanges, OwnerLanguage } from '../../../core/i18n/translation.model';
import { FALLBACK_LANGUAGE, TranslationService } from '../../../core/i18n/translation.service';
import { LanguageDraft, LocalizationDrafts } from '../../../core/owner/localization-drafts.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { ownerErrorText } from '../owner-error';
import { HoldsUnsavedChanges } from '../unsaved-changes.guard';

/** A language code as the database keeps it - the same expression as languageCodeOk() in PHP. */
const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/;
/** A place in the order: a whole number from 0 to 1000, as the server takes it. */
const SORT_ORDER = /^\d{1,4}$/;
const SORT_ORDER_MAX = 1000;

/** The order a chooser shows them in - the server's: by their place, then by name, then by code. */
function inOrder(languages: OwnerLanguage[]): OwnerLanguage[] {
  return [...languages].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'en') || a.code.localeCompare(b.code, 'en'));
}

/** A row's fields as they are saved: what a draft is measured against. */
function savedDraft(language: OwnerLanguage): LanguageDraft {
  return { name: language.name, nativeName: language.nativeName, sortOrder: String(language.sortOrder) };
}

function sameDraft(a: LanguageDraft, b: LanguageDraft): boolean {
  return a.name === b.name && a.nativeName === b.nativeName && a.sortOrder === b.sortOrder;
}

/**
 * The languages the app can be read in: their names, their order in the
 * chooser, and whether people are offered them. The page itself is English
 * (its root says so: lang="en").
 *
 * English is what every other language falls back to: it cannot be hidden or
 * deleted. A language the app is released in (the migrations write strings
 * for it) can be hidden but not deleted; any other can be deleted, and its
 * strings go with it. The page only hides what the server refuses anyway, and
 * shows the server's sentence when it does refuse.
 *
 * A new language starts hidden unless the person adding it says otherwise:
 * with no string of its own yet it would read in English throughout, under
 * its own name in the chooser.
 *
 * What is typed in a row and not saved is held in LocalizationDrafts, not
 * here: the rows must be as they were typed when the page is back - after
 * the way to the sign-in and back, too.
 */
@Component({
  selector: 'app-languages',
  templateUrl: './languages.component.html',
  styleUrl: './languages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ConfirmDialogComponent],
})
export class LanguagesComponent implements HoldsUnsavedChanges {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(TranslationService);

  private readonly confirm = viewChild.required(ConfirmDialogComponent);

  private readonly list = signal<OwnerLanguage[] | null>(null);
  /**
   * The rows whose fields do not say what is saved, by code. Kept outside the
   * page, so they outlive it; the browser's question before the tab is closed
   * is asked there too.
   */
  private readonly drafts = inject(LocalizationDrafts).languages;
  /** What went wrong with a row's change, by code - the server's own sentence when it gave one. */
  private readonly errors = signal<Record<string, string>>({});

  protected readonly loadError = signal<string | null>(null);
  /** The language whose names and order are being saved, whose checkbox is being saved, and the one being deleted. */
  protected readonly saving = signal<string | null>(null);
  protected readonly switching = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);
  /** What the last change did - said in the bar that stays in view. */
  protected readonly happened = signal<string | null>(null);

  protected readonly newCode = signal('');
  protected readonly newName = signal('');
  protected readonly newNativeName = signal('');
  /** Offered to readers the moment it is added - off unless the person says so: a new language has no strings yet. */
  protected readonly newOffered = signal(false);
  protected readonly adding = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly fallback = FALLBACK_LANGUAGE;
  protected readonly loaded = computed(() => this.list() !== null);
  protected readonly languages = computed(() => this.list() ?? []);
  protected readonly unsaved = computed(() => Object.keys(this.drafts()).length);
  protected readonly canAdd = computed(() => this.newCode().trim() !== '' && this.newName().trim() !== '' && this.newNativeName().trim() !== '');
  /** Said under the code as it is typed - the server's rule, in the server's words. */
  protected readonly newCodeError = computed(() => {
    const code = this.newCode().trim().toLowerCase();
    return code === '' || LANGUAGE_CODE.test(code) ? null : 'A language\'s code is two small letters, or two and two with a dash between: "sk", "pt-br".';
  });

  constructor() {
    // What was typed before the page went is in the drafts already; the
    // languages that come say which of it is still a change.
    void this.load();
  }

  /**
   * Leaving with a row changed and not saved asks first - and "Leave" is what
   * gives the changes up: they are kept outside the page, so they would be in
   * their rows again the next time, against what was just answered.
   */
  canLeave(): boolean | Promise<boolean> {
    const unsaved = this.unsaved();
    if (!unsaved) {
      return true;
    }
    return this.confirm()
      .ask({
        title: 'Leave without saving?',
        message: `${unsaved === 1 ? '1 language has' : `${unsaved} languages have`} changes that are not saved yet, and leaving loses them.`,
        confirmLabel: 'Leave',
        cancelLabel: 'Stay here',
        danger: true,
      })
      .then((leave) => {
        if (leave) {
          this.drafts.set({});
        }
        return leave;
      });
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      const languages = inOrder(await this.api.languages());
      this.list.set(languages);
      // Drafts kept from before: not for a language that is gone, and not one that says what is saved now.
      this.drafts.update((drafts) =>
        Object.fromEntries(
          Object.entries(drafts).filter(([code, draft]) => {
            const language = languages.find((other) => other.code === code);
            return language !== undefined && !sameDraft(draft, savedDraft(language));
          }),
        ),
      );
    } catch (error) {
      this.loadError.set(ownerErrorText(error));
    }
  }

  // ── A row ──────────────────────────────────────────────────────────────────

  /** What a row's fields show: what is typed, or what is saved. */
  protected draft(language: OwnerLanguage): LanguageDraft {
    const drafts = this.drafts();
    return Object.hasOwn(drafts, language.code) ? drafts[language.code] : savedDraft(language);
  }

  protected isChanged(language: OwnerLanguage): boolean {
    return Object.hasOwn(this.drafts(), language.code);
  }

  protected errorOf(language: OwnerLanguage): string | null {
    const errors = this.errors();
    return Object.hasOwn(errors, language.code) ? errors[language.code] : null;
  }

  protected edit(language: OwnerLanguage, change: Partial<LanguageDraft>): void {
    this.keep(language, { ...this.draft(language), ...change });
    // What the bar said was about the rows as they stood.
    this.happened.set(null);
  }

  /** What stands in a field, as the event that changed it tells it. */
  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected ticked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected undo(language: OwnerLanguage): void {
    this.forget(language.code);
    this.setError(language.code, null);
  }

  /** What the checkbox of a row means as it stands. */
  protected offeredHint(language: OwnerLanguage): string {
    return language.code === FALLBACK_LANGUAGE
      ? 'Always offered: every other language falls back to it.'
      : language.enabled
        ? 'People can choose it.'
        : 'Nobody is offered it; its strings are kept.';
  }

  /**
   * The names and the place in the order - what changed of them, in one
   * request. The row's fields stay open meanwhile: what is typed in them
   * before the answer comes is a change to what the answer saved, not lost to it.
   */
  protected async save(language: OwnerLanguage): Promise<void> {
    if (this.saving() !== null) {
      return;
    }
    const draft = this.draft(language);
    const changes: LanguageChanges = {};
    if (draft.name !== language.name) {
      changes.name = draft.name;
    }
    if (draft.nativeName !== language.nativeName) {
      changes.nativeName = draft.nativeName;
    }
    if (draft.sortOrder !== String(language.sortOrder)) {
      const sortOrder = SORT_ORDER.test(draft.sortOrder.trim()) ? Number(draft.sortOrder.trim()) : -1;
      if (sortOrder < 0 || sortOrder > SORT_ORDER_MAX) {
        this.setError(language.code, 'The order is a whole number from 0 to 1000.');
        return;
      }
      changes.sortOrder = sortOrder;
    }

    this.saving.set(language.code);
    this.setError(language.code, null);
    try {
      const saved = await this.api.updateLanguage(language.code, changes);
      // The fields as they stand now: as they were sent - or typed in since the
      // request left (typed back to what was saved before, even: `language` is
      // still that row, so its fields read as they show).
      const now = this.draft(language);
      this.replace(saved);
      if (sameDraft(now, draft)) {
        this.forget(language.code);
      } else {
        // A change again - measured against what is saved now.
        this.keep(saved, now);
      }
      this.happened.set(`${saved.name} is saved.`);
      this.refreshApp();
    } catch (error) {
      // Refused, not reached, or the sign-in is over: the row stays as typed, and says why.
      this.setError(language.code, ownerErrorText(error));
    } finally {
      this.saving.set(null);
    }
  }

  /**
   * Offered or hidden, saved the moment the checkbox is ticked. The row says
   * the new state at once and goes back to the old one if the server refuses -
   * the checkbox follows, because its state is the row's.
   */
  protected async setOffered(language: OwnerLanguage, enabled: boolean): Promise<void> {
    if (enabled === language.enabled) {
      return;
    }
    this.switching.set(language.code);
    this.setError(language.code, null);
    this.patch(language.code, { enabled });
    try {
      const saved = await this.api.updateLanguage(language.code, { enabled });
      this.patch(language.code, { enabled: saved.enabled });
      this.happened.set(saved.enabled ? `${saved.name} is offered to everybody now.` : `${saved.name} is hidden: nobody is offered it.`);
      this.refreshApp();
    } catch (error) {
      this.patch(language.code, { enabled: !enabled });
      this.setError(language.code, ownerErrorText(error));
    } finally {
      this.switching.set(null);
    }
  }

  /** Never for a language the app is released in - the server refuses those; any other goes with its strings. */
  protected async remove(language: OwnerLanguage): Promise<void> {
    const sure = await this.confirm().ask({
      title: `Delete ${language.name} (${language.code})?`,
      message: 'Every string of the app written in it goes with it, and none of it can be brought back.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!sure) {
      return;
    }
    this.deleting.set(language.code);
    this.setError(language.code, null);
    try {
      await this.api.deleteLanguage(language.code);
      this.list.update((languages) => (languages ?? []).filter((other) => other.code !== language.code));
      this.forget(language.code);
      this.happened.set(`${language.name} is deleted.`);
      this.refreshApp();
    } catch (error) {
      this.setError(language.code, ownerErrorText(error));
    } finally {
      this.deleting.set(null);
    }
  }

  // ── A new language ─────────────────────────────────────────────────────────

  protected async add(): Promise<void> {
    if (!this.canAdd() || this.newCodeError() !== null || this.adding()) {
      return;
    }
    this.adding.set(true);
    this.addError.set(null);
    try {
      // Said every time, on or off: whether readers are offered it is this form's to decide, not a default's.
      const added = await this.api.createLanguage({ code: this.newCode().trim().toLowerCase(), name: this.newName().trim(), nativeName: this.newNativeName().trim(), enabled: this.newOffered() });
      this.list.update((languages) => inOrder([...(languages ?? []), added]));
      this.newCode.set('');
      this.newName.set('');
      this.newNativeName.set('');
      this.newOffered.set(false);
      // By what the server made of it - the row says the same.
      this.happened.set(added.enabled ? `${added.name} is added, and offered to everybody. It reads in English until its strings are written.` : `${added.name} is added, hidden. Write its strings, then offer it.`);
      this.refreshApp();
    } catch (error) {
      this.addError.set(ownerErrorText(error));
    } finally {
      this.adding.set(false);
    }
  }

  private replace(saved: OwnerLanguage): void {
    this.list.update((languages) => inOrder((languages ?? []).map((language) => (language.code === saved.code ? saved : language))));
  }

  private patch(code: string, change: Partial<OwnerLanguage>): void {
    this.list.update((languages) => (languages ?? []).map((language) => (language.code === code ? { ...language, ...change } : language)));
  }

  private forget(code: string): void {
    this.drafts.update(({ [code]: _, ...others }) => others);
  }

  /** A row's fields measured against the row as it is saved: a draft while they differ, none when they say the same. */
  private keep(language: OwnerLanguage, draft: LanguageDraft): void {
    const same = sameDraft(draft, savedDraft(language));
    this.drafts.update(({ [language.code]: _, ...others }) => (same ? others : { ...others, [language.code]: draft }));
  }

  private setError(code: string, message: string | null): void {
    this.errors.update(({ [code]: _, ...others }) => (message === null ? others : { ...others, [code]: message }));
  }

  /** The chooser's list comes with the app's strings: both are read again now, not at the next reload. */
  private refreshApp(): void {
    void this.i18n.reload();
  }
}
