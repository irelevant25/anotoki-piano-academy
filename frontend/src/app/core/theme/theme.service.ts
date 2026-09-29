import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { readStorage, writeStorage } from '../util/storage';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Shared with public/theme-boot.js, which applies the same choice before the app has loaded. */
export const THEME_KEY = 'piano-academy:theme';

/** The browser chrome's colour, matched to each theme's page background. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f4f5f8', dark: '#14161c' };

/**
 * Light, dark, or whatever the operating system says (auto).
 *
 * The resolved theme is written to <html data-theme>, which every colour token
 * in styles.scss keys on. "auto" keeps listening to the system setting while
 * the page is open. The choice is this device's (localStorage): it is about
 * the screen, not the person.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly mode = signal<ThemeMode>(storedMode());
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this.mode();
    return mode === 'auto' ? (this.systemDark() ? 'dark' : 'light') : mode;
  });

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemDark.set(event.matches));

    effect(() => {
      const theme = this.resolved();
      const root = this.document.documentElement;
      root.dataset['theme'] = theme;
      root.style.colorScheme = theme;
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    writeStorage(THEME_KEY, mode === 'auto' ? null : mode);
  }

  /** auto -> light -> dark -> auto: what the footer's button does. */
  cycle(): void {
    const order: ThemeMode[] = ['auto', 'light', 'dark'];
    this.set(order[(order.indexOf(this.mode()) + 1) % order.length]);
  }
}

function storedMode(): ThemeMode {
  const value = readStorage(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'auto';
}
