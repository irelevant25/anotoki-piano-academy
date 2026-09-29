import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ThemeService } from '../../core/theme/theme.service';

const LABELS = { auto: 'Theme: automatic', light: 'Theme: light', dark: 'Theme: dark' } as const;

/** The footer's theme button: automatic (as the system) -> light -> dark. */
@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly label = computed(() => LABELS[this.theme.mode()]);
  protected readonly icon = computed(() => (this.theme.mode() === 'auto' ? '◐' : this.theme.mode() === 'light' ? '☀' : '☾'));
}
