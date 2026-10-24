import { ChangeDetectionStrategy, Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideTestAnotokiAuth } from '@anotoki/lib/auth/testing';
import { ANOTOKI_LEGAL_CONFIG, provideAnotokiLegal } from '@anotoki/lib/legal';
import { ContactPageComponent, PrivacyPageComponent, TermsPageComponent } from '@anotoki/lib/legal/pages';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { PIANO_LEGAL_UPDATED, SIGN_IN_HINT_COOKIE, pianoLegalFacts, pianoLegalPagesConfig } from './legal-facts';
import { pianoLegalConfig } from '../../../shared/legal/legal.config';

/** The IAM this test's app signs in with: GET /api/auth/config's issuer and client id. */
const IAM = 'https://iam.anotoki.example';

/** Every address a legal page of Piano Academy's may link to: the anotoki account's pages, its own Contact page, the family's address and operator, the authority, Cloudflare. */
const ADDRESSES = [
  `${IAM}/account`,
  `${IAM}/privacy`,
  '/contact',
  'mailto:support@anotoki.eu',
  'https://codehero.sk',
  'https://dataprotection.gov.sk/',
  'https://www.websupport.sk',
  'https://www.cloudflare.com/privacypolicy/',
];

/**
 * Piano Academy's own strings the facts name, as stand-ins: the words themselves are migration 012's (and the
 * backend's tests hold them - no address, informal Slovak); what is checked here is where each goes.
 */
const WORDS: Record<string, string> = {
  'brand.area': 'Piano Academy',
  'legal.about': 'A piano tutor.',
  'legal.record.name': 'Your record',
  'legal.record.what': 'The record.',
  'legal.record.why': 'Why the record.',
  'legal.record.kept': 'How long the record.',
  'legal.progress.name': 'Your progress',
  'legal.progress.what': 'The progress.',
  'legal.progress.why': 'Why the progress.',
  'legal.progress.kept': 'How long the progress.',
  'legal.limits.name': 'Limits against floods',
  'legal.limits.what': 'The counts.',
  'legal.limits.why': 'Why the counts.',
  'legal.limits.kept': 'How long the counts.',
  'legal.words.name': 'If you keep the site’s words',
  'legal.words.what': 'Who saved a word.',
  'legal.words.why': 'Why who saved a word.',
  'legal.words.kept': 'How long who saved a word.',
  'legal.visitors.what': 'A visitor.',
  'legal.visitors.why': 'Why a visitor.',
  'legal.visitors.kept': 'Until a sign-in, or {days} days after the last visit.',
  'legal.feedback.what': 'A message, its kind and the part of the app.',
  'legal.feedback.kept': 'Until an administrator deletes it.',
  'legal.auditLog.what': 'The staff’s changes, and a progress file brought back.',
  'legal.backups.what': 'A copy on each day the site is used.',
  'legal.backups.kept': 'The 14 newest daily copies.',
  'legal.storage.signIn.purpose': 'The sign-in.',
  'legal.storage.signInUnderWay.purpose': 'A sign-in under way.',
  'legal.storage.signInUnderWay.kept': 'Until it comes back.',
  'legal.storage.hint.purpose': 'Never read here.',
  'legal.storage.tabLanguage.purpose': 'A tab’s language.',
  'legal.storage.untilTabClosed': 'Until the tab is closed.',
  'legal.storage.visitorKey.kept': 'Until you sign in.',
  'legal.storage.outbox.purpose': 'Rounds not saved yet.',
  'legal.storage.outbox.kept': 'Until the server has them.',
  'legal.storage.replaced.purpose': 'A note for the other tabs.',
  'legal.storage.replaced.kept': 'Until the next file.',
  'legal.storage.piano.purpose': 'The last piano.',
  'legal.storage.piano.kept': 'Until another piano.',
  'legal.storage.wordDrafts.purpose': 'Unsaved words.',
};

/** The legal pages' frame, as sites/main/legal/legal-layout gives the pages their configuration: the app's, with its facts. */
@Component({
  selector: 'app-test-privacy-frame',
  imports: [PrivacyPageComponent],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: pianoLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<anotoki-privacy-page />',
})
class PrivacyFrameComponent {}

@Component({
  selector: 'app-test-terms-frame',
  imports: [TermsPageComponent],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: pianoLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<anotoki-terms-page />',
})
class TermsFrameComponent {}

@Component({
  selector: 'app-test-contact-frame',
  imports: [ContactPageComponent],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: pianoLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<anotoki-contact-page />',
})
class ContactFrameComponent {}

/**
 * The family's legal pages (@anotoki/lib/legal/pages) as Piano Academy fills them in: the root configuration
 * (shared/legal/legal.config.ts - the language, the database's words, no facts) and the facts the pages' frame gives
 * them (sites/main/legal/legal-facts.ts) - drawn for real, so that what the pages say of the app is checked where people
 * read it: its parts, its cookies and stored items by name, who else handles data, the anotoki account's pages at
 * the IAM's address the app signs in with - and every link where the code says, whatever an administrator rewords.
 */
describe('the legal pages, as Piano Academy fills them in', () => {
  let fixture: ComponentFixture<unknown> | null = null;

  async function configure(values: Record<string, string> = {}, language: 'en' | 'sk' = 'en'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        language === 'en' ? provideTestTranslations({ ...WORDS, ...values }) : provideTestTranslations({ ...WORDS, ...values }, { language: 'sk', english: WORDS }),
        provideAnotokiLegal(pianoLegalConfig),
        ...provideTestAnotokiAuth({ config: { config: () => ({ issuer: IAM, client_id: 'piano-academy', login_required: true, sign_in_available: true }) } }),
      ],
    });
    await TestBed.inject(AnotokiAuth).init();
  }

  async function draw(frame: Type<unknown>): Promise<HTMLElement> {
    fixture = TestBed.createComponent(frame);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const texts = (host: HTMLElement, selector: string) => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim());

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
    document.body.innerHTML = '';
  });

  it('the root configuration: the page’s language, the database’s words of the library’s keys - and no facts, which come with the pages’ frame', async () => {
    await configure({ 'anotoki.legal.privacyTitle': 'Our privacy' });
    const config = TestBed.inject(ANOTOKI_LEGAL_CONFIG);
    expect(config.language?.()).toBe('en');
    expect(config.translate?.('anotoki.legal.privacyTitle')).toBe('Our privacy');
    expect(config.paths).toBeUndefined();
    expect(config.operator).toBeUndefined();
    expect(() => config.facts()).toThrow(/frame/);
  });

  it('the facts: four parts of its own, the visitors for the days the sweep keeps them, feedback, its audit log and plain backups in its words, its cookies and storage by name, the hosting company and Cloudflare', async () => {
    await configure();
    const facts = pianoLegalFacts(TestBed.inject(TranslationService), TestBed.inject(AnotokiAuth));
    expect(facts.site).toBe('Piano Academy');
    expect(facts.about).toBe(WORDS['legal.about']);
    expect(facts.updated).toBe(PIANO_LEGAL_UPDATED);
    // The anotoki account's pages at the IAM the app signs in with - never a string's address.
    expect(facts.account).toEqual({ deleteUrl: `${IAM}/account`, privacyUrl: `${IAM}/privacy` });
    expect(facts.data.map((part) => part.name)).toEqual(['Your record', 'Your progress', 'Limits against floods', 'If you keep the site’s words']);
    expect(facts.visitors).toEqual({ what: WORDS['legal.visitors.what'], why: WORDS['legal.visitors.why'], kept: 'Until a sign-in, or 30 days after the last visit.' });
    // Piano Academy takes feedback (the form at the foot of every page): its own words for what a message keeps and how long.
    expect(facts.feedback).toEqual({ what: WORDS['legal.feedback.what'], kept: WORDS['legal.feedback.kept'] });
    expect(facts.errorLog).toBeUndefined();
    expect(facts.analytics).toBeUndefined();
    expect(facts.fanDisclaimer).toBeUndefined();
    expect(facts.auditLog).toEqual({ what: WORDS['legal.auditLog.what'] });
    expect(facts.backups).toEqual({ what: WORDS['legal.backups.what'], kept: WORDS['legal.backups.kept'] });
    expect(facts.storage.map((item) => [item.name, item.kind ?? null, item.preset ?? null])).toEqual([
      ['anotoki-auth:piano-academy', null, 'signIn'],
      ['anotoki-auth:piano-academy:login:…, anotoki-auth:discovery:…', 'session', null],
      [SIGN_IN_HINT_COOKIE, null, 'signInHint'],
      ['piano-academy:theme', null, 'theme'],
      ['piano-academy:language, piano-academy:language-cache', null, 'language'],
      ['piano-academy:language', 'session', null],
      ['piano-academy:visitor', null, 'visitorKey'],
      ['piano-learning:unsaved-sessions:…', 'local', null],
      ['piano-academy:progress-replaced:…', 'local', null],
      ['piano-learning:last-midi-device-name', 'local', null],
      ['piano-academy:localization-drafts', 'session', null],
    ]);
    expect(facts.processors).toEqual([{ preset: 'hosting', name: 'WebSupport s.r.o.', url: 'https://www.websupport.sk' }, { preset: 'cloudflare' }]);
  });

  it('the Privacy page, drawn for real in the frame’s configuration: the app’s parts in order, its storage, who else handles data, the account kept by the anotoki account - and every link where the code says, a rewording changing words, never an address', async () => {
    await configure({ 'legal.progress.what': 'See https://evil.example for more.', 'anotoki.legal.accountPage': 'Delete it at https://evil.example' });
    const host = await draw(PrivacyFrameComponent);

    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Privacy policy');
    expect(Array.from(host.querySelectorAll('[data-kept]')).map((part) => part.getAttribute('data-kept'))).toEqual([
      'data-0',
      'data-1',
      'data-2',
      'data-3',
      'visitors',
      'feedback',
      'error-log',
      'audit-log',
      'backups',
    ]);
    // The app's words, then the library's sentence for plain backups: on the server, out of public reach - never encrypted.
    const backups = texts(host, '[data-kept="backups"] .anotoki-legal-page__text')[0] ?? '';
    expect([backups.startsWith(`${WORDS['legal.backups.what']} `), backups.includes('out of public reach'), backups.includes('encrypted')]).toEqual([true, true, false]);
    expect(texts(host, '[data-duration="visitors"] dd')).toEqual(['Until a sign-in, or 30 days after the last visit.']);
    expect(texts(host, '[data-duration="feedback"] dd')).toEqual([WORDS['legal.feedback.kept']]);
    // The error log in the library's words: 30 days, the address as a keyed code.
    expect(texts(host, '[data-duration="error-log"] dd')).toEqual(['30 days.']);
    expect(texts(host, '[data-stored] code')).toEqual([
      'anotoki-auth:piano-academy',
      'anotoki-auth:piano-academy:login:…, anotoki-auth:discovery:…',
      'anotoki_signed_in',
      'piano-academy:theme',
      'piano-academy:language, piano-academy:language-cache',
      'piano-academy:language',
      'piano-academy:visitor',
      'piano-learning:unsaved-sessions:…',
      'piano-academy:progress-replaced:…',
      'piano-learning:last-midi-device-name',
      'piano-academy:localization-drafts',
    ]);
    expect(texts(host, '[data-recipient] .anotoki-legal-page__item-name')).toEqual(['WebSupport s.r.o.', 'Cloudflare, Inc.']);
    expect(host.querySelector('[data-analytics]')?.textContent).toContain('umami.anotoki.eu');

    // The account: kept by the anotoki account, whose own Privacy page - at the IAM the app signs in with - is linked.
    expect(host.querySelector('[data-account-privacy]')?.getAttribute('href')).toBe(`${IAM}/privacy`);
    const deletion = host.querySelector<HTMLAnchorElement>('[data-account-page]')!;
    expect([deletion.getAttribute('href'), deletion.textContent?.trim()]).toEqual([`${IAM}/account`, 'Delete it at https://evil.example']);
    expect(host.querySelector('[data-kept="data-1"]')?.textContent).toContain('See https://evil.example for more.');
    const links = Array.from(host.querySelectorAll('a[href]')).map((link) => link.getAttribute('href')!);
    expect(links.filter((href) => !href.startsWith('#') && !ADDRESSES.includes(href))).toEqual([]);
    expect(links).not.toContain('https://evil.example');
  });

  it('Terms: what Piano Academy is, first, under its name; no fan clause', async () => {
    await configure();
    const host = await draw(TermsFrameComponent);
    expect(host.querySelector('[data-about]')?.textContent?.trim()).toBe(WORDS['legal.about']);
    expect(host.querySelector('[data-section="what"] h2')?.textContent?.trim()).toBe('What Piano Academy is');
    expect(host.querySelector('[data-fan]')).toBeNull();
  });

  it('Contact: the feedback form first - Piano Academy takes feedback -, then the address, and the anotoki account’s page to delete the account', async () => {
    await configure();
    const host = await draw(ContactFrameComponent);
    expect(host.querySelector('[data-section="feedback"] [data-open-feedback]')?.textContent?.trim()).toBe('Send feedback');
    expect(host.querySelector('[data-section="email"] h2')?.textContent?.trim()).toBe('Everything else');
    expect(host.querySelector('[data-section="email"] a')?.getAttribute('href')).toBe('mailto:support@anotoki.eu');
    expect(host.querySelector('[data-account-page]')?.getAttribute('href')).toBe(`${IAM}/account`);
    expect(host.querySelector('[data-section="delete"]')?.textContent).toContain('Piano Academy then keeps what you did here without your name');
  });

  it('in Slovak: the library’s words - which address nobody - around the app’s, its {days} filled in', async () => {
    await configure({ 'legal.visitors.kept': 'Kým sa neprihlásiš, alebo {days} dní od poslednej návštevy.' }, 'sk');
    const host = await draw(PrivacyFrameComponent);
    expect(host.querySelector('anotoki-privacy-page')?.getAttribute('lang')).toBe('sk');
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Ochrana osobných údajov');
    expect(texts(host, '[data-duration="visitors"] dd')).toEqual(['Kým sa neprihlásiš, alebo 30 dní od poslednej návštevy.']);
  });
});
