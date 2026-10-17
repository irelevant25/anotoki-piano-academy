import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { NoteState, PathProgress, ProgressMap } from '../../core/music/music.types';
import { PathService } from '../../core/music/path.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { provideTestAuth } from '../../core/testing/test-auth';
import { HomePageComponent } from './home-page.component';

/** Every string the home page asks for: its own, the path's, and the four modes of the navigation. */
const ENGLISH: Record<string, string> = {
  'common.percent': '{value}%',
  'nav.trainer': 'Note Trainer',
  'nav.sheet': 'Sheet Practice',
  'nav.songs': 'Songs',
  'nav.stats': 'Stats',
  'home.continue.tag': 'Continue where you left off',
  'home.continue.button': 'Continue',
  'home.start.tag': 'Start here',
  'home.start.button': 'Start learning',
  'home.unit.title': 'Unit {number} · {title}',
  'home.unit.new': 'New: {notes}',
  'home.unit.review': 'Review',
  'home.unit.song': 'Song: {title}',
  'home.done.tag': 'All available units done',
  'home.done.title': 'You finished the right hand! 🎉',
  'home.done.text': 'The left hand is coming next. Until then, keep your notes fresh with free practice below.',
  'home.due.one': '{count} note is due for review.',
  'home.due.few': '{count} notes are due for review.',
  'home.due.other': '{count} notes are due for review.',
  'home.reviewInTrainer': 'Review in Note Trainer',
  'home.comingSoon': 'Coming soon',
  'home.free.title': 'Free practice',
  'home.free.text': 'Practice on your own, outside the path. It uses the same note progress, so it helps the path too.',
  'path.phase.right-hand.title': 'Right hand',
  'path.phase.right-hand.description': 'Learn the notes from Middle C up to the next C, one small group at a time.',
  'path.phase.left-hand.title': 'Left hand',
  'path.phase.left-hand.description': 'The same steps for the left hand, reading the bass clef: C3 to G3, then A3 and B3.',
  'path.phase.hands-together.title': 'Both hands',
  'path.phase.hands-together.description': 'Melodies passed between the hands, then both hands playing at the same time.',
  'path.phase.left-hand-chords.title': 'Left-hand chords',
  'path.phase.left-hand-chords.description': 'C, F and G chords in the left hand.',
  'path.phase.right-hand-chords.title': 'Right-hand chords',
  'path.phase.right-hand-chords.description': 'The same chords in the right hand.',
  'path.phase.melody-and-chords.title': 'Melody and chords',
  'path.phase.melody-and-chords.description': 'A right-hand melody over left-hand chords.',
  'path.step.meet.title': 'Meet the notes',
  'path.step.meet.short': 'Meet',
  'path.step.drill.title': 'Note drill',
  'path.step.drill.short': 'Drill',
  'path.step.read.title': 'Read a melody',
  'path.step.read.short': 'Read',
  'path.step.tempo.title': 'Play in time',
  'path.step.tempo.short': 'In time',
  'path.step.song.title': 'Song',
  'path.step.song.short': 'Song',
  'path.unit.rh-5.title': 'B and high C',
};

const SLOVAK: Record<string, string> = {
  'common.percent': '{value} %',
  'nav.trainer': 'Tréning nôt',
  'nav.sheet': 'Hra z nôt',
  'nav.songs': 'Skladby',
  'nav.stats': 'Štatistiky',
  'home.continue.tag': 'Pokračuj tam, kde sa naposledy skončilo',
  'home.continue.button': 'Pokračovať',
  'home.start.tag': 'Začni tu',
  'home.start.button': 'Začať sa učiť',
  'home.unit.title': 'Lekcia {number} · {title}',
  'home.unit.new': 'Nové: {notes}',
  'home.unit.review': 'Opakovanie',
  'home.unit.song': 'Skladba: {title}',
  'home.done.tag': 'Všetky dostupné lekcie sú hotové',
  'home.done.title': 'Pravú ruku máš hotovú! 🎉',
  'home.done.text': 'Ďalšia na rade je ľavá ruka. Dovtedy si noty udržuj v pamäti voľným cvičením nižšie.',
  'home.due.one': 'Na zopakovanie čaká {count} nota.',
  'home.due.few': 'Na zopakovanie čakajú {count} noty.',
  'home.due.other': 'Na zopakovanie čaká {count} nôt.',
  'home.reviewInTrainer': 'Zopakovať v Tréningu nôt',
  'home.comingSoon': 'Už čoskoro',
  'home.free.title': 'Voľné cvičenie',
  'home.free.text': 'Cvič podľa seba, mimo cesty. Postup pri jednotlivých notách je ten istý, takže to pomôže aj na ceste.',
  'path.phase.right-hand.title': 'Pravá ruka',
  'path.phase.right-hand.description': 'Nauč sa noty stredné C až ďalšie C, vždy po malej skupinke.',
  'path.phase.left-hand.title': 'Ľavá ruka',
  'path.phase.left-hand.description': 'Tie isté kroky pre ľavú ruku, s čítaním basového kľúča: C3 až G3, potom A3 a B3.',
  'path.phase.hands-together.title': 'Obe ruky',
  'path.phase.hands-together.description': 'Melódie, ktoré si ruky podávajú, a potom obe ruky naraz.',
  'path.phase.left-hand-chords.title': 'Akordy ľavou rukou',
  'path.phase.left-hand-chords.description': 'Akordy C, F a G ľavou rukou.',
  'path.phase.right-hand-chords.title': 'Akordy pravou rukou',
  'path.phase.right-hand-chords.description': 'Tie isté akordy pravou rukou.',
  'path.phase.melody-and-chords.title': 'Melódia a akordy',
  'path.phase.melody-and-chords.description': 'Pravá ruka hrá melódiu, ľavá k nej akordy.',
  'path.step.meet.title': 'Zoznám sa s notami',
  'path.step.meet.short': 'Zoznámenie',
  'path.step.drill.title': 'Precvičovanie nôt',
  'path.step.drill.short': 'Precvičovanie',
  'path.step.read.title': 'Čítanie melódie',
  'path.step.read.short': 'Čítanie',
  'path.step.tempo.title': 'Hra v rytme',
  'path.step.tempo.short': 'V rytme',
  'path.step.song.title': 'Skladba',
  'path.step.song.short': 'Skladba',
  'path.unit.rh-5.title': 'B a vysoké C',
};

/** A note that is being learned and was due an hour ago. */
function due(midi: number): NoteState {
  return {
    midi,
    status: 'learning',
    repetitions: 1,
    easeFactor: 2.5,
    intervalHours: 4,
    dueAt: new Date(Date.now() - 3600_000).toISOString(),
    lastGrade: 4,
    totalAttempts: 3,
    correctAttempts: 3,
    avgTimingErrorMs: null,
    lastGrowthAt: null,
    updatedAt: null,
  };
}

const dueNotes = (count: number): ProgressMap => Object.fromEntries([60, 62, 64, 67, 65, 69, 71, 72].slice(0, count).map((midi) => [String(midi), due(midi)]));

describe('Home page: the path in the learner’s words', () => {
  let fixture: ComponentFixture<HomePageComponent>;
  let host: HTMLElement;
  let store: ProgressStore;
  let path: PathService;

  const text = (selector: string): string | undefined => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const all = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  /** The path document after these steps were played, each with its best result. */
  function played(results: Record<string, number>): PathProgress {
    return Object.entries(results).reduce<PathProgress>((progress, [key, accuracy]) => path.recordStepResult(progress, key, accuracy), path.createInitialPathProgress());
  }

  async function page(language: 'en' | 'sk', strings: Record<string, string> = language === 'sk' ? SLOVAK : ENGLISH): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), language === 'sk' ? provideTestTranslations(strings, { language: 'sk', english: ENGLISH }) : provideTestTranslations(strings), ...provideTestAuth()],
    });
    store = TestBed.inject(ProgressStore);
    path = TestBed.inject(PathService);
    fixture = TestBed.createComponent(HomePageComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function having(progress: ProgressMap, steps: PathProgress = { steps: {} }): Promise<void> {
    store.state.set({ progress, sessions: [], path: steps });
    await fixture.whenStable();
  }

  afterEach(() => vi.restoreAllMocks());

  it('a first visit in English reads as it always did, and asks for no string it has not got', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await page('en');

    expect(text('.continue-card .continue-tag')).toBe('Start here');
    expect(text('.continue-card h2')).toBe('Unit 1 · C, D, E');
    expect(text('.continue-step')).toBe('Meet the notes');
    expect(text('#continue')).toBe('Start learning');
    expect(host.querySelector('.review-banner')).toBeNull();

    expect(all('.phase h2')).toEqual(['Right hand']);
    expect(text('.phase .phase-description')).toBe('Learn the notes from Middle C up to the next C, one small group at a time.');
    expect(all('.unit-head strong')).toEqual(['Unit 1 · C, D, E', 'Unit 2 · G', 'Unit 3 · F', 'Unit 4 · A', 'Unit 5 · B and high C']);
    expect(all('.unit-head .unit-details')[0]).toBe('New: C4, D4, E4 · Song: Hot Cross Buns');
    expect(all('.unit-head .unit-details')[4]).toBe('New: B4, C5 · Song: Joy to the World (opening, simplified rhythm)');
    expect(all('.unit:first-child .anotoki-chip')).toEqual(['▶ Meet', 'Drill', 'Read', 'In time', 'Song']);
    expect(Array.from(host.querySelectorAll('.unit:first-child .anotoki-chip')).map((chip) => chip.getAttribute('title'))).toEqual(['Meet the notes', 'Note drill', 'Read a melody', 'Play in time', 'Song']);

    expect(all('.phase.is-coming strong')).toEqual(['Left hand', 'Both hands', 'Left-hand chords', 'Right-hand chords', 'Melody and chords']);
    expect(all('.phase.is-coming anotoki-badge')).toEqual(['Coming soon', 'Coming soon', 'Coming soon', 'Coming soon', 'Coming soon']);
    expect(text('.free-practice h2')).toBe('Free practice');
    expect(all('.free-practice button')).toEqual(['Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);

    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps what the browser checks read: the Continue button, and each chip’s step key', async () => {
    await page('sk');
    expect(host.querySelector('#continue')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('.unit:first-child [data-open]')).map((chip) => chip.getAttribute('data-open'))).toEqual(['rh-1/meet', 'rh-1/drill', 'rh-1/read', 'rh-1/tempo', 'rh-1/song']);
  });

  it('draws the path with the family’s pieces (anotoki-lib 0.6.0): the call to go on the card’s highlight, each step a chip in its state - passed green, open blue, locked off', async () => {
    await page('en');
    await having({}, played({ 'rh-1/meet': 100, 'rh-1/drill': 90 }));
    // The Continue card is the family's highlighted card - its blue edge and glow are the kit's, not Piano's own.
    const card = host.querySelector('anotoki-card.continue-card');
    expect(card?.getAttribute('data-tone')).toBe('highlight');
    expect(card?.querySelector('#continue')).not.toBeNull();
    // Each step is the kit's chip on a real button: its tone the step's state, a locked one off (and said so by the ✓ / ▶ too).
    const chips = Array.from(host.querySelectorAll<HTMLButtonElement>('.unit:first-child button.anotoki-chip'));
    expect(chips.map((chip) => [chip.getAttribute('data-state'), chip.getAttribute('data-tone'), chip.disabled])).toEqual([
      ['passed', 'success', false],
      ['passed', 'success', false],
      ['open', 'primary', false],
      ['locked', 'neutral', true],
      ['locked', 'neutral', true],
    ]);
    // Never a toggle: a step is no choice, so no chip says pressed or checked (and none draws the kit's check).
    expect(chips.some((chip) => chip.hasAttribute('aria-pressed') || chip.hasAttribute('aria-checked') || chip.querySelector('.anotoki-chip__check'))).toBe(false);
    expect(chips.every((chip) => chip.type === 'button')).toBe(true);
  });

  it('reads in Slovak: the path’s own words are translated, note names and song titles are not', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await page('sk');

    expect(text('.continue-card .continue-tag')).toBe('Začni tu');
    expect(text('.continue-card h2')).toBe('Lekcia 1 · C, D, E');
    expect(text('.continue-step')).toBe('Zoznám sa s notami');
    expect(text('#continue')).toBe('Začať sa učiť');
    expect(all('.phase h2')).toEqual(['Pravá ruka']);
    expect(all('.unit-head strong')).toEqual(['Lekcia 1 · C, D, E', 'Lekcia 2 · G', 'Lekcia 3 · F', 'Lekcia 4 · A', 'Lekcia 5 · B a vysoké C']);
    expect(all('.unit-head .unit-details')[0]).toBe('Nové: C4, D4, E4 · Skladba: Hot Cross Buns');
    expect(all('.unit:first-child .anotoki-chip')).toEqual(['▶ Zoznámenie', 'Precvičovanie', 'Čítanie', 'V rytme', 'Skladba']);
    expect(all('.phase.is-coming strong')).toEqual(['Ľavá ruka', 'Obe ruky', 'Akordy ľavou rukou', 'Akordy pravou rukou', 'Melódia a akordy']);
    expect(all('.phase.is-coming anotoki-badge')[0]).toBe('Už čoskoro');
    expect(all('.free-practice button')).toEqual(['Tréning nôt', 'Hra z nôt', 'Skladby', 'Štatistiky']);

    expect(warn).not.toHaveBeenCalled();
  });

  it('a passed step shows its best result, the unit written the language’s way', async () => {
    await page('en');
    await having({}, played({ 'rh-1/meet': 100, 'rh-1/drill': 90, 'rh-1/read': 70 }));
    expect(all('.unit:first-child .anotoki-chip')).toEqual(['✓ Meet', '✓ Drill 90%', '▶ Read', 'In time', 'Song']);
    expect(text('.continue-card .continue-tag')).toBe('Continue where you left off');
    expect(text('.continue-step')).toBe('Read a melody');
    expect(text('#continue')).toBe('Continue');

    await page('sk');
    await having({}, played({ 'rh-1/meet': 100, 'rh-1/drill': 90, 'rh-1/read': 70 }));
    expect(all('.unit:first-child .anotoki-chip')).toEqual(['✓ Zoznámenie', '✓ Precvičovanie 90 %', '▶ Čítanie', 'V rytme', 'Skladba']);
    expect(text('.continue-card .continue-tag')).toBe('Pokračuj tam, kde sa naposledy skončilo');
    expect(text('#continue')).toBe('Pokračovať');
  });

  it('the notes due for review are one sentence, the number in bold - counted the English way', async () => {
    await page('en');
    await having(dueNotes(1));
    expect(text('.review-banner span')).toBe('1 note is due for review.');
    expect(text('.review-banner strong')).toBe('1');
    expect(text('.review-banner button')).toBe('Review in Note Trainer');

    await having(dueNotes(3));
    expect(text('.review-banner span')).toBe('3 notes are due for review.');
    expect(text('.review-banner strong')).toBe('3');

    await having({});
    expect(host.querySelector('.review-banner')).toBeNull();
  });

  it('- and the Slovak way: 1, 2 to 4, 5 and more, the verb agreeing too', async () => {
    await page('sk');
    const seen: Array<[string | undefined, string | undefined]> = [];
    for (const count of [1, 2, 4, 5, 8]) {
      await having(dueNotes(count));
      seen.push([text('.review-banner span'), text('.review-banner strong')]);
    }
    expect(seen).toEqual([
      ['Na zopakovanie čaká 1 nota.', '1'],
      ['Na zopakovanie čakajú 2 noty.', '2'],
      ['Na zopakovanie čakajú 4 noty.', '4'],
      ['Na zopakovanie čaká 5 nôt.', '5'],
      ['Na zopakovanie čaká 8 nôt.', '8'],
    ]);
    expect(text('.review-banner button')).toBe('Zopakovať v Tréningu nôt');
  });

  it('draws no number where a form of the sentence does not name it', async () => {
    await page('sk', { ...SLOVAK, 'home.due.one': 'Na zopakovanie čaká jedna nota.' });
    await having(dueNotes(1));
    expect(text('.review-banner span')).toBe('Na zopakovanie čaká jedna nota.');
    expect(host.querySelector('.review-banner strong')).toBeNull();

    await having(dueNotes(2));
    expect(text('.review-banner span')).toBe('Na zopakovanie čakajú 2 noty.');
    expect(text('.review-banner strong')).toBe('2');
  });

  it('says so when every available step is passed - with nothing gendered about the learner', async () => {
    await page('sk');
    await having({}, played(Object.fromEntries(path.pathSteps.map((entry) => [entry.key, 100]))));
    expect(host.querySelector('#continue')).toBeNull();
    expect(text('.continue-card .continue-tag')).toBe('Všetky dostupné lekcie sú hotové');
    expect(text('.continue-card h2')).toBe('Pravú ruku máš hotovú! 🎉');
    expect(all('.unit-badge')).toEqual(['✓', '✓', '✓', '✓', '✓']);
  });

  it('follows the language when it changes on the page', async () => {
    await page('sk');
    await having(dueNotes(2), played({ 'rh-1/meet': 100, 'rh-1/drill': 85 }));
    expect(all('.unit:first-child .anotoki-chip').slice(0, 2)).toEqual(['✓ Zoznámenie', '✓ Precvičovanie 85 %']);
    expect(all('.unit-head strong')[4]).toBe('Lekcia 5 · B a vysoké C');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(all('.unit:first-child .anotoki-chip').slice(0, 2)).toEqual(['✓ Meet', '✓ Drill 85%']);
    expect(all('.unit-head strong')[4]).toBe('Unit 5 · B and high C');
    expect(text('.review-banner span')).toBe('2 notes are due for review.');
    expect(all('.phase h2')).toEqual(['Right hand']);
  });
});
