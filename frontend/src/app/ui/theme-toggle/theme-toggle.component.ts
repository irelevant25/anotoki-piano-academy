import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { IconComponent, IconName } from '../icon/icon.component';
import { keepOnScreen } from '../keep-on-screen';

/**
 * What the button says for each mode, as keys written out whole: what it
 * shows, and what it says to a screen reader - the same, and that pressing
 * changes it. Two sentences per mode, not one with a tail glued on: where
 * "(press to change)" stands is the language's to say.
 */
const WORDS: Record<ThemeMode, { label: string; spoken: string }> = {
  auto: { label: 'theme.auto', spoken: 'theme.autoSpoken' },
  light: { label: 'theme.light', spoken: 'theme.lightSpoken' },
  dark: { label: 'theme.dark', spoken: 'theme.darkSpoken' },
};

/** The mode's icon: the screen for "as the system", the sun, the moon. */
const ICONS: Record<ThemeMode, IconName> = { auto: 'monitor', light: 'sun', dark: 'moon' };

/**
 * The top bar's theme button, round and icon-only: automatic (as the system)
 * -> light -> dark. Its name - the mode, and that pressing changes it - is in
 * its aria-label, and the mode alone in its title.
 *
 * For somebody signed in the choice is the account's, for every anotoki site
 * (ThemeService). When the account would not take it, the account's theme is
 * back on the screen and a note under the button says so (theme.notSaved, a
 * role="alert" - as the language chooser beside it says that a language could
 * not be loaded), until the next press or a click anywhere else. The words
 * promise nothing: after access_denied (the account no longer let into Piano
 * Academy) trying again would not help.
 */
@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly words = computed(() => WORDS[this.theme.mode()]);
  protected readonly icon = computed(() => ICONS[this.theme.mode()]);

  private readonly _note = viewChild<ElementRef<HTMLElement>>('note');

  constructor() {
    // On a phone the button stands near the bar's right edge: the note is measured once it is drawn, and moved onto the screen.
    afterRenderEffect(() => keepOnScreen(this._note()?.nativeElement));
  }

  /** A click anywhere but on the button and its note: the note has been seen. */
  protected onDocumentClick(event: MouseEvent): void {
    if (this.theme.notSaved() && !this._host.nativeElement.contains(event.target as Node)) {
      this.theme.notSaved.set(false);
    }
  }
}
