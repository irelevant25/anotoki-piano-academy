import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type AnotokiPreferenceChanges, type AnotokiPreferences, type AnotokiSavedPreferences } from '../auth/anotoki-auth';
import { AuthService } from '../auth/auth.service';
import { THEME_KEY, ThemeMode, ThemeService } from './theme.service';

/** A save to the account the spec answers by hand: what was sent, and how to answer it. */
interface PendingSave {
  changes: AnotokiPreferenceChanges;
  /** As the SDK does: the account's new preferences into user() first, then the promise resolves. */
  accept(): void;
  refuse(code?: string): void;
}

describe('ThemeService: the anotoki account’s theme for somebody signed in, this device’s for anybody else', () => {
  /** The account's preferences as AuthService holds them: null for nobody, a visitor, or an IAM that sends none. */
  const preferences = signal<AnotokiPreferences | null>(null);
  let saves: PendingSave[];
  const auth = {
    preferences,
    savePreferences: vi.fn(
      (changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> =>
        new Promise((resolve, reject) => {
          saves.push({
            changes,
            accept: () => {
              const now = { ...(preferences() ?? { theme: 'auto', date_format: null, time_format: null }), ...changes } as AnotokiPreferences;
              preferences.set(now);
              resolve({ locale: 'en', preferences: now });
            },
            refuse: (code = 'network') => reject(Object.assign(new Error('The IAM could not be reached'), { code })),
          });
        }),
    ),
  };

  function theme(): ThemeService {
    return TestBed.inject(ThemeService);
  }

  /** The effects have run, and the answers given have come back. */
  async function settle(): Promise<void> {
    await Promise.resolve();
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();
  }

  const account = (mode: ThemeMode): AnotokiPreferences => ({ theme: mode, date_format: null, time_format: null });

  /** As in the app: the service made at the start (app.config.ts), its effects run - and then the account's theme arrives. */
  async function signedInWith(mode: ThemeMode): Promise<void> {
    theme();
    await settle();
    preferences.set(account(mode));
    await settle();
  }

  beforeEach(() => {
    localStorage.clear();
    preferences.set(null);
    saves = [];
    auth.savePreferences.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('signed out: the device’s theme - what this browser chose last, kept for the first paint - and nothing goes to an account', async () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(theme().mode()).toBe('dark');
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('dark');

    theme().cycle();
    await settle();
    expect(theme().mode()).toBe('auto');
    // "auto" is no choice to keep: theme-boot.js asks the system then.
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    theme().set('light');
    await settle();
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(auth.savePreferences).not.toHaveBeenCalled();
  });

  it('takes the account’s theme the moment it is known - at sign-in, and when it changes elsewhere - and keeps it for the next first paint', async () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(theme().mode()).toBe('light');

    preferences.set(account('dark'));
    await settle();
    expect(theme().mode()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    // Changed on another anotoki site, or in another tab: here too.
    preferences.set(account('auto'));
    await settle();
    expect(theme().mode()).toBe('auto');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(auth.savePreferences).not.toHaveBeenCalled();
  });

  it('saves a choice to the account, showing it at once - and not while the IAM keeps no preferences (before its 015)', async () => {
    await signedInWith('auto');

    theme().set('dark');
    expect(theme().mode()).toBe('dark');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }]);
    saves[0].accept();
    await settle();
    expect(theme().mode()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    // The account has it already: nothing to save.
    theme().set('dark');
    await settle();
    expect(saves).toHaveLength(1);

    // Signed in through an IAM that sends no preferences: the device's, as before.
    preferences.set(null);
    await settle();
    theme().set('light');
    await settle();
    expect(theme().mode()).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(saves).toHaveLength(1);
  });

  it('does not flick to what the account says while a choice made here is still being saved', async () => {
    await signedInWith('light');

    theme().set('dark');
    theme().set('auto');
    // The first save's answer: the account says dark - while auto, chosen since, is still to be saved.
    saves[0].accept();
    await settle();
    expect(theme().mode()).toBe('auto');
    // Another site changes it meanwhile: not shown either while the save is on its way.
    preferences.set(account('light'));
    await settle();
    expect(theme().mode()).toBe('auto');

    // The account's last word is the latest choice.
    saves[1].accept();
    await settle();
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }, { theme: 'auto' }]);
    expect(preferences()?.theme).toBe('auto');
    expect(theme().mode()).toBe('auto');
  });

  it('one save at a time, the latest choice last - and none when the account has it by then', async () => {
    await signedInWith('auto');

    // auto -> light -> dark -> auto, pressed quickly: only the first goes at once.
    theme().cycle();
    theme().cycle();
    theme().cycle();
    expect(theme().mode()).toBe('auto');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'light' }]);

    // Its answer: the latest choice (auto) is saved now, so it is the account's last word.
    saves[0].accept();
    await settle();
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'light' }, { theme: 'auto' }]);
    expect(theme().mode()).toBe('auto');
    saves[1].accept();
    await settle();
    expect(preferences()?.theme).toBe('auto');
    expect(theme().mode()).toBe('auto');

    // Back to the account's own theme while a save is on its way: when that save settles (refused, here),
    // the account has the latest choice already - nothing more to save, and nothing to say.
    theme().set('dark');
    theme().set('auto');
    saves[2].refuse();
    await settle();
    expect(saves).toHaveLength(3);
    expect(theme().notSaved()).toBe(false);
    expect(theme().mode()).toBe('auto');
  });

  it('puts the account’s theme back when the account would not take the choice, and says so until the next choice', async () => {
    await signedInWith('light');

    theme().set('dark');
    saves[0].refuse('temporarily_unavailable');
    await settle();
    expect(theme().mode()).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(theme().notSaved()).toBe(true);

    // The IAM no longer lets this account into Piano Academy (access_denied): the same - put back, and said.
    theme().set('dark');
    expect(theme().notSaved()).toBe(false);
    saves[1].refuse('access_denied');
    await settle();
    expect(theme().mode()).toBe('light');
    expect(theme().notSaved()).toBe(true);

    theme().set('dark');
    expect(theme().notSaved()).toBe(false);
    saves[2].accept();
    await settle();
    expect(theme().mode()).toBe('dark');
    expect(theme().notSaved()).toBe(false);
  });

  it('a refusal a later choice has overtaken is no news: the later choice is saved, and stays on the screen', async () => {
    await signedInWith('light');

    theme().set('dark');
    theme().set('auto');
    saves[0].refuse();
    await settle();
    expect(theme().notSaved()).toBe(false);
    expect(theme().mode()).toBe('auto');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }, { theme: 'auto' }]);
    saves[1].accept();
    await settle();
    expect(theme().mode()).toBe('auto');
  });

  it('signed out while the save was on its way: the choice stays on this device, and the refusal is said', async () => {
    await signedInWith('light');

    theme().set('dark');
    preferences.set(null);
    saves[0].refuse('login_required');
    await settle();
    expect(theme().mode()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(theme().notSaved()).toBe(true);
  });
});
