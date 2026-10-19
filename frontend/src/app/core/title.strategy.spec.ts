import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { provideSiteTranslations } from './i18n/site-translations';
import { PianoTitleStrategy } from './title.strategy';

const ENGLISH = { 'title.learn': 'Learn', 'title.trainer': 'Note Trainer', 'anotoki.about.title': 'About anotoki' };
const SLOVAK = { 'title.learn': 'Učenie', 'title.trainer': 'Tréning nôt', 'anotoki.about.title': 'O projekte anotoki' };

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

const ROUTES = [
  { path: '', title: 'title.learn', component: TestPageComponent },
  { path: 'trainer', title: 'title.trainer', component: TestPageComponent },
  { path: 'stats', title: 'title.stats', component: TestPageComponent },
  { path: 'about', title: 'anotoki.about.title', component: TestPageComponent },
  { path: 'admin/translations', title: 'Translations', component: TestPageComponent },
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

  it('words the library’s own heading of its About page from the bundle too, in the language on the page (anotoki-lib 0.8.0)', async () => {
    await TestBed.inject(Router).navigateByUrl('/about');
    expect(title()).toBe('O projekte anotoki · Piano Academy');
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    expect(title()).toBe('About anotoki · Piano Academy');
  });

  it('follows the language without a navigation', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('Učenie · Piano Academy');
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    expect(title()).toBe('Learn · Piano Academy');
  });

  it('writes any other title as it is - the admin panel’s pages are English - and says they are the admin panel’s', async () => {
    await TestBed.inject(Router).navigateByUrl('/admin/translations');
    expect(title()).toBe('Translations · Admin panel · Piano Academy');
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

  it('tells the translation service where the page is after every navigation - which is when that one asks again for strings it has not', async () => {
    const navigated = vi.spyOn(TestBed.inject(TranslationService), 'noteAddress');
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await router.navigateByUrl('/trainer');
    expect(navigated.mock.calls).toEqual([['/'], ['/trainer']]);
  });
});

describe('PianoTitleStrategy with no strings at all', () => {
  // The app is not set up: its sign-in settings could not be read, so nothing is asked for - and a first visit has
  // nothing kept either. The words as the app wires them (core/i18n/site-translations.ts).
  // Nobody signed in, and no sign-in settings read: nothing is asked of the server (core/i18n/site-translations.ts's canAsk).
  const auth = { locale: () => null, signedIn: () => false, preferences: () => null, state: () => 'unavailable', subject: () => null, isStaff: () => false, isAdmin: () => false };
  const http = { get: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    http.get.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: AnotokiAuth, useValue: auth },
        provideSiteTranslations(),
        provideRouter(ROUTES),
        { provide: TitleStrategy, useClass: PianoTitleStrategy },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('words the title from the English kept in code - never the key - and asks the server for nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const i18n = TestBed.inject(TranslationService);
    await i18n.init();
    expect(i18n.ready()).toBe(false);

    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('Learn · Piano Academy');
    await TestBed.inject(Router).navigateByUrl('/trainer');
    expect(title()).toBe('Note Trainer · Piano Academy');
    await TestBed.inject(Router).navigateByUrl('/admin/translations');
    expect(title()).toBe('Translations · Admin panel · Piano Academy');
    // The library's heading of its About page has no words kept here: the app's name alone - never the key.
    await TestBed.inject(Router).navigateByUrl('/about');
    expect(title()).toBe('Piano Academy');

    expect(warn).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });
});
