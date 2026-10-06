import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
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
 * the page is open.
 *
 * Signed in, the theme is the account's (the IAM's migration 015, the owner's
 * decision of 2026-10-06): one choice every anotoki site follows - every page
 * here, the admin panel too - read from the account at sign-in and whenever
 * it changes (another tab, another anotoki site, a refresh of the tokens),
 * and saved to it from the theme button. Signed out - a visitor, or nobody
 * yet - it is this device's, as it always was; so it is too while the IAM
 * sends no preferences (an IAM before its 015, a sign-in without `profile`),
 * and then nothing is saved to the account. Either way the theme on the
 * screen is kept in localStorage, where public/theme-boot.js reads it before
 * the first paint, so a dark choice never flashes light while the app and the
 * account load.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  /** The account's theme while somebody is signed in and the IAM keeps one; null otherwise. */
  private readonly accountTheme = computed(() => this.auth.preferences()?.theme ?? null);

  /** A theme save is on its way. */
  private saving = false;
  /** The latest theme chosen while it is: saved once it settles. */
  private next: ThemeMode | null = null;

  readonly mode = signal<ThemeMode>(storedMode());
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this.mode();
    return mode === 'auto' ? (this.systemDark() ? 'dark' : 'light') : mode;
  });
  /**
   * The account did not take the last theme chosen here, and its own is on
   * the screen again: the theme button says so (theme.notSaved) until the
   * next press, or a click anywhere else.
   */
  readonly notSaved = signal(false);

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemDark.set(event.matches));

    effect(() => {
      const theme = this.resolved();
      const root = this.document.documentElement;
      root.dataset['theme'] = theme;
      root.style.colorScheme = theme;
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
    });

    // The account's theme, the moment it is known: at sign-in, and whenever
    // the account is read again. Not while a choice made here is still being
    // saved: until its answer comes, the account says the earlier theme, and
    // the page would flick back to it.
    effect(() => {
      const theme = this.accountTheme();
      if (theme && !this.saving) {
        untracked(() => this.show(theme));
      }
    });
  }

  /**
   * The person's choice: shown at once and, while somebody is signed in (and
   * the IAM keeps the account's preferences), saved to the account, so every
   * anotoki site follows it.
   *
   * One save at a time, and the last choice is the one saved: two saves on
   * their way together could be answered in either order and leave the
   * account on a theme the page no longer shows. A choice made while a save
   * is on its way waits for it to settle - only the latest such choice, and
   * only if the account does not have it by then. A save that is refused -
   * whatever the reason: the IAM out of reach, the sign-in ended, the account
   * no longer let into Piano Academy (access_denied) - puts the account's
   * theme back on the screen, and the button says so.
   */
  set(mode: ThemeMode): void {
    this.notSaved.set(false);
    this.show(mode);
    if (this.saving) {
      this.next = mode;
      return;
    }
    this.save(mode);
  }

  /** auto -> light -> dark -> auto: what the top bar's theme button does. */
  cycle(): void {
    const order: ThemeMode[] = ['auto', 'light', 'dark'];
    this.set(order[(order.indexOf(this.mode()) + 1) % order.length]);
  }

  private save(mode: ThemeMode): void {
    const accountTheme = this.accountTheme();
    if (accountTheme === null || accountTheme === mode) {
      return;
    }
    this.saving = true;
    /** The save is over: the next choice, if one waits, is saved now - and then this one's refusal is not news. */
    const settle = (): boolean => {
      const next = this.next;
      this.saving = false;
      this.next = null;
      if (next !== null) {
        this.save(next);
      }
      return next !== null;
    };
    this.auth.savePreferences({ theme: mode }).then(
      () => {
        settle();
      },
      () => {
        if (!settle()) {
          const current = this.accountTheme();
          if (current) {
            this.show(current);
          }
          this.notSaved.set(true);
        }
      },
    );
  }

  /** On the screen, and kept for the next page load's first paint. */
  private show(mode: ThemeMode): void {
    this.mode.set(mode);
    writeStorage(THEME_KEY, mode === 'auto' ? null : mode);
  }
}

function storedMode(): ThemeMode {
  const value = readStorage(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'auto';
}
