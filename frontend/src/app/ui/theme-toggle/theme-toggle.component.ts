import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';

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

/** The footer's theme button: automatic (as the system) -> light -> dark. */
@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly words = computed(() => WORDS[this.theme.mode()]);
  protected readonly icon = computed(() => (this.theme.mode() === 'auto' ? '◐' : this.theme.mode() === 'light' ? '☀' : '☾'));
}
