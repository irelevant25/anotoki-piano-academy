import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { MockInstance } from 'vitest';
import { TranslationService } from '../../core/i18n/translation.service';
import { MidiService, PianoMidi } from '../../core/midi/midi.service';
import { NoteState, ProgressMap } from '../../core/music/music.types';
import { SrsService } from '../../core/music/srs.service';
import { TheoryService } from '../../core/music/theory.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { NotationComponent } from '../../ui/notation/notation.component';
import { TrainerPageComponent } from './trainer-page.component';

const ENGLISH: Record<string, string> = {
  'keyboard.label': 'On-screen piano keyboard',
  'trainer.title': 'Note Trainer',
  'trainer.prompt': 'Prompt {position}',
  'trainer.correctSoFar': '{count} correct so far',
  'trainer.start': 'Play the note shown above on your piano.',
  'trainer.play': 'Play this note on your piano.',
  'trainer.correct': 'Correct!',
  'trainer.wrong': 'That was {played} — target was {target}.',
};

const SLOVAK: Record<string, string> = {
  'keyboard.label': 'Klaviatúra na obrazovke',
  'trainer.title': 'Tréning nôt',
  'trainer.prompt': 'Úloha {position}',
  'trainer.correctSoFar': 'správne: {count}',
  'trainer.start': 'Zahraj na klavíri notu, ktorú vidíš hore.',
  'trainer.play': 'Zahraj túto notu na klavíri.',
  'trainer.correct': 'Správne!',
  'trainer.wrong': 'To bolo {played} – správne bolo {target}.',
};

/** The staff's place on the page, without VexFlow: the trainer draws nothing when it finds no staff. */
@Component({ selector: 'app-notation', template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class NoStaffComponent {}

describe('Note Trainer: what it says is a key, worded on the page', () => {
  let fixture: ComponentFixture<TrainerPageComponent>;
  let host: HTMLElement;
  let piano: PianoMidi;
  let theory: TheoryService;
  let warn: MockInstance;

  const text = (selector: string): string | null => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const press = (midi: number): void => {
    piano.dispatchEvent(new CustomEvent('noteon', { detail: { midi, velocity: 90, timestamp: performance.now() } }));
  };

  async function open(slovak: Record<string, string> = SLOVAK): Promise<void> {
    piano = new PianoMidi();
    const progress = signal<ProgressMap>({});
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(slovak, { language: 'sk', english: ENGLISH }),
        { provide: MidiService, useValue: { piano } },
        {
          provide: ProgressStore,
          useFactory: () => {
            const srs = TestBed.inject(SrsService);
            return {
              progress,
              knownNotes: signal<number[]>([]),
              noteState: (midi: number): NoteState => progress()[midi] ?? srs.createInitialNoteState(midi),
              saveProgress: () => Promise.resolve(),
              recordSession: () => Promise.resolve({}),
            };
          },
        },
      ],
    });
    TestBed.overrideComponent(TrainerPageComponent, { remove: { imports: [NotationComponent] }, add: { imports: [NoStaffComponent] } });
    theory = TestBed.inject(TheoryService);
    fixture = TestBed.createComponent(TrainerPageComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('words the line above the staff around its two numbers, which stay elements of their own', async () => {
    await open();

    expect(text('h2')).toBe('Tréning nôt');
    expect(text('p.tag')).toBe('Úloha 1 / 12 · správne: 0');
    expect(text('#tr-progress')).toBe('1 / 12');
    expect(text('#tr-correct')).toBe('0');
    expect(text('#tr-feedback')).toBe('Zahraj túto notu na klavíri.');
    expect(warn).not.toHaveBeenCalled();
  });

  it('says what was played by note name, at once, and says it again in the language the page changes to', async () => {
    await open();
    const target = theory.nameToMidi(text('#tr-name') ?? '');
    const other = target === 60 ? 62 : 60;

    press(other);
    // Set in the piano's handler, with nothing awaited: it is on the page at the next look.
    fixture.detectChanges();
    expect(text('#tr-feedback')).toBe(`To bolo ${theory.midiToName(other)} – správne bolo ${theory.midiToName(target)}.`);
    expect(host.querySelector('#tr-feedback')?.classList.contains('feedback--incorrect')).toBe(true);

    // The page kept a key and two note names, not a sentence: the same feedback, now in English.
    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(text('#tr-feedback')).toBe(`That was ${theory.midiToName(other)} — target was ${theory.midiToName(target)}.`);
    expect(text('p.tag')).toBe('Prompt 1 / 12 · 0 correct so far');
    expect(text('#tr-progress')).toBe('1 / 12');
    expect(text('#tr-name')).toBe(theory.midiToName(target));
    expect(warn).not.toHaveBeenCalled();
  });

  it('counts a right answer in its own element', async () => {
    await open();
    press(theory.nameToMidi(text('#tr-name') ?? ''));
    fixture.detectChanges();

    expect(text('#tr-feedback')).toBe('Správne!');
    expect(text('#tr-correct')).toBe('1');
    expect(text('p.tag')).toBe('Úloha 1 / 12 · správne: 1');
  });

  it('draws no number where a language’s sentence leaves its place out', async () => {
    await open({ ...SLOVAK, 'trainer.prompt': 'Hraj ďalej' });

    expect(host.querySelector('#tr-progress')).toBeNull();
    expect(text('p.tag')).toBe('Hraj ďalej · správne: 0');
    expect(text('#tr-correct')).toBe('0');
  });
});
