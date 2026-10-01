import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { TranslationService } from './i18n/translation.service';
import { provideTestTranslations } from './testing/test-translations';
import { PianoTitleStrategy } from './title.strategy';

const ENGLISH = { 'title.learn': 'Learn', 'title.trainer': 'Note Trainer' };
const SLOVAK = { 'title.learn': 'Učenie', 'title.trainer': 'Tréning nôt' };

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

const ROUTES = [
  { path: '', title: 'title.learn', component: TestPageComponent },
  { path: 'trainer', title: 'title.trainer', component: TestPageComponent },
  { path: 'stats', title: 'title.stats', component: TestPageComponent },
  { path: 'translations', title: 'Translations', component: TestPageComponent },
  { path: 'untitled', component: TestPageComponent },
];

function title(): string {
  TestBed.tick();
  return TestBed.inject(Title).getTitle();
}

describe('PianoTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }), provideRouter(ROUTES), { provide: TitleStrategy, useClass: PianoTitleStrategy }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('words a title that is a key, in the language on the page, before the app’s name - which is never translated', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('Učenie · Piano Academy');
    await TestBed.inject(Router).navigateByUrl('/trainer');
    expect(title()).toBe('Tréning nôt · Piano Academy');
  });

  it('follows the language without a navigation', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('Učenie · Piano Academy');
    await TestBed.inject(TranslationService).setLanguage('en', false);
    expect(title()).toBe('Learn · Piano Academy');
  });

  it('writes any other title as it is: the owner’s pages are English', async () => {
    await TestBed.inject(Router).navigateByUrl('/translations');
    expect(title()).toBe('Translations · Piano Academy');
  });

  it('shows a key that has no string as the key - with a bundle in memory', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await TestBed.inject(Router).navigateByUrl('/stats');
    expect(title()).toBe('title.stats · Piano Academy');
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'title.stats'"]]);
  });

  it('writes the app’s name alone for a route without a title', async () => {
    await TestBed.inject(Router).navigateByUrl('/untitled');
    expect(title()).toBe('Piano Academy');
  });

  it('tells the translation service after every navigation - which is when that one asks again for strings it has not', async () => {
    const navigated = vi.spyOn(TestBed.inject(TranslationService), 'navigated');
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await router.navigateByUrl('/trainer');
    expect(navigated).toHaveBeenCalledTimes(2);
  });
});

describe('PianoTitleStrategy with no strings at all', () => {
  // The app is not set up: nothing was asked for, and a first visit has nothing kept either.
  const auth = { usesSignIn: () => false, user: () => null, signedIn: () => false, onAuthChange: () => () => undefined };
  const http = { get: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    http.get.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: http }, { provide: AuthService, useValue: auth }, provideRouter(ROUTES), { provide: TitleStrategy, useClass: PianoTitleStrategy }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('words the title from the English kept in code - never the key - and asks the server for nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const i18n = TestBed.inject(TranslationService);
    await i18n.init(false);
    expect(i18n.ready()).toBe(false);

    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('Learn · Piano Academy');
    await TestBed.inject(Router).navigateByUrl('/trainer');
    expect(title()).toBe('Note Trainer · Piano Academy');
    await TestBed.inject(Router).navigateByUrl('/translations');
    expect(title()).toBe('Translations · Piano Academy');

    expect(warn).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });
});
