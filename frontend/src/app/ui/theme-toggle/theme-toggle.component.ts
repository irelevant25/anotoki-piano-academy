import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { IconComponent, IconName } from '../icon/icon.component';

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
 */
@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly words = computed(() => WORDS[this.theme.mode()]);
  protected readonly icon = computed(() => ICONS[this.theme.mode()]);
}
