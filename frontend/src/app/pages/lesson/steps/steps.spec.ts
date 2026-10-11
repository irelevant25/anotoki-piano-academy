import { ChangeDetectionStrategy, Component, Type, forwardRef, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import type { MockInstance } from 'vitest';
import { MidiService, PianoMidi } from '../../../core/midi/midi.service';
import { NoteState, ProgressMap } from '../../../core/music/music.types';
import { PathService } from '../../../core/music/path.service';
import { SrsService } from '../../../core/music/srs.service';
import { TheoryService } from '../../../core/music/theory.service';
import { ProgressStore } from '../../../core/state/progress-store.service';
import { NotationComponent } from '../../../ui/notation/notation.component';
import { StepOutcome } from '../step-outcome';
import { DrillStepComponent } from './drill-step.component';
import { MeetStepComponent } from './meet-step.component';
import { SequenceStepComponent } from './sequence-step.component';

const ENGLISH: Record<string, string> = {
  'keyboard.label': 'On-screen piano keyboard',
  'meet.instruction.one': 'Here is your new note. Find the blue key and play it {times} times.',
  'meet.instruction.few': 'Here are your new notes. Find the blue key and play it {times} times.',
  'meet.instruction.other': 'Here are your new notes. Find the blue key and play it {times} times.',
  'meet.repsSpoken': '{done} of {total}',
  'meet.noteOf': 'Note {position} of {total}',
  'meet.wrong': 'That was {note}. Play the blue key.',
  'meet.again': 'Yes! Again.',
  'meet.thatIs': "That's {note}!",
  'path.hint.60': 'Middle C: the white key just left of the two black keys, near the middle of your piano.',
  'path.hint.67': 'G sits between the first and second of the three black keys.',
  'drill.instruction': 'Read the note on the staff and play it. The light-blue keys are the notes you know.',
  'drill.progress': '{position} / {total} · {correct} correct',
  'drill.question': 'Which note is this?',
  'drill.correct': 'Correct - {note}!',
  'drill.wrong': 'That was {played} - this one is {target}.',
  'sequence.read.instruction': 'Play the melody from left to right. No metronome - take your time on each note.',
  'sequence.tempo.instruction': 'Now play a melody in time. Listen to 4 clicks, then play one note on every click.',
  'sequence.tempo.start': 'Start',
  'sequence.tempo.restart': 'Restart',
  'sequence.song.instruction': "{title} — play it with the metronome to finish the step. Want to learn it first? Use a practice run with no clock (it doesn't count).",
  'sequence.song.practice': 'Practice run (no clock)',
  'sequence.song.start': 'Play with metronome',
  'sequence.song.practiceResult': "Practice run: {accuracy}%. When you're ready, play it with the metronome.",
  'tempo.label': 'Tempo:',
  'tempo.bpm': '{bpm} BPM',
  'tempo.bpmOriginal': '{bpm} BPM (original)',
  'player.takeYourTime': 'Play the blue note. Take your time - there is no clock.',
  'player.good': 'Good!',
  'player.gotIt': 'Got it.',
  'player.wrong.tryAgain': 'That was {note} - try again.',
  'player.done': 'Done - {correct}/{total} correct ({accuracy}%).',
};

const SLOVAK: Record<string, string> = {
  'keyboard.label': 'Klaviatúra na obrazovke',
  'meet.instruction.one': 'Toto je tvoja nová nota. Nájdi modrý kláves a stlač ho {times}-krát.',
  'meet.instruction.few': 'Toto sú tvoje nové noty. Pri každej nájdi modrý kláves a stlač ho {times}-krát.',
  'meet.instruction.other': 'Toto sú tvoje nové noty. Pri každej nájdi modrý kláves a stlač ho {times}-krát.',
  'meet.repsSpoken': 'Zahrané: {done}, treba: {total}',
  'meet.noteOf': 'Nota {position} / {total}',
  'meet.wrong': 'To bolo {note}. Zahraj modrý kláves.',
  'meet.again': 'Áno! Ešte raz.',
  'meet.thatIs': 'To je {note}!',
  'path.hint.60': 'Stredné C: biely kláves hneď vľavo od dvoch čiernych klávesov, približne v strede klavíra.',
  'path.hint.67': 'G je medzi prvým a druhým z troch čiernych klávesov.',
  'drill.instruction': 'Prečítaj notu na notovej osnove a zahraj ju. Svetlomodré klávesy sú noty, ktoré už poznáš.',
  'drill.progress': '{position} / {total} · správne: {correct}',
  'drill.question': 'Ktorá nota je to?',
  'drill.correct': 'Správne – {note}!',
  'drill.wrong': 'To bolo {played} – toto je {target}.',
  'sequence.read.instruction': 'Zahraj melódiu zľava doprava. Bez metronómu – pri každej note sa neponáhľaj.',
  'sequence.tempo.instruction': 'Teraz zahraj melódiu v rytme. Vypočuj si 4 kliky a potom zahraj na každý klik jednu notu.',
  'sequence.tempo.start': 'Štart',
  'sequence.tempo.restart': 'Spustiť znova',
  'sequence.song.instruction': '{title} – na dokončenie kroku zahraj túto skladbu s metronómom. Chceš sa ju najprv naučiť? Skús skúšobné kolo bez metronómu (nepočíta sa).',
  'sequence.song.practice': 'Skúšobné kolo (bez metronómu)',
  'sequence.song.start': 'Hrať s metronómom',
  'sequence.song.practiceResult': 'Skúšobné kolo: {accuracy} %. Keď budeš chcieť, zahraj to s metronómom.',
  'tempo.label': 'Tempo:',
  'tempo.bpm': '{bpm} BPM',
  'tempo.bpmOriginal': '{bpm} BPM (pôvodné tempo)',
  'player.takeYourTime': 'Zahraj modrú notu. Neponáhľaj sa – metronóm tu nebeží.',
  'player.good': 'Dobre!',
  'player.gotIt': 'Máš to.',
  'player.wrong.tryAgain': 'To bolo {note} – skús to znova.',
  'player.done': 'Hotovo – správne {correct} / {total} ({accuracy} %).',
};

/** What the staff stand-in was last asked to draw. */
const drawn: { single: number | null; sequence: number[] } = { single: null, sequence: [] };

/**
 * The staff without VexFlow, found by the steps as the real one is
 * (viewChild(NotationComponent)): it draws nothing and remembers what it was
 * asked to draw, which is how a spec knows the note a step waits for.
 */
@Component({
  selector: 'app-notation',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NotationComponent, useExisting: forwardRef(() => StaffStubComponent) }],
})
class StaffStubComponent {
  /** The real staff's input (the drill centres its one note). */
  readonly center = input(false);

  notation(): unknown {
    return {
      renderSingleNote: (midi: number) => {
        drawn.single = midi;
      },
      renderSequence: (notes: { midi: number }[]) => {
        drawn.sequence = notes.map((note) => note.midi);
        return notes.map(() => {
          const element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          return { getSVGElement: () => element };
        });
      },
    };
  }
}

describe('Lesson steps: instructions and feedback are keys, worded on the page', () => {
  let host: HTMLElement;
  let piano: PianoMidi;
  let path: PathService;
  let warn: MockInstance;
  let outcomes: StepOutcome[];
  let stable: () => Promise<unknown>;

  const text = (selector: string): string | null => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const press = async (midi: number): Promise<void> => {
    piano.dispatchEvent(new CustomEvent('noteon', { detail: { midi, velocity: 90, timestamp: performance.now() } }));
    await stable();
  };
  const english = async (): Promise<void> => {
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await stable();
  };

  async function open<T extends { done: { subscribe(fn: (outcome: StepOutcome) => void): unknown } }>(
    step: Type<T>,
    unitId: string,
    stepId: string,
    slovak: Record<string, string> = SLOVAK,
  ): Promise<ComponentFixture<T>> {
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
              noteState: (midi: number): NoteState => progress()[midi] ?? srs.createInitialNoteState(midi),
              updateNote: () => Promise.resolve(),
            };
          },
        },
      ],
    });
    TestBed.overrideComponent(step, { remove: { imports: [NotationComponent] }, add: { imports: [StaffStubComponent] } });
    path = TestBed.inject(PathService);
    const fixture = TestBed.createComponent(step);
    host = fixture.nativeElement;
    stable = () => fixture.whenStable();
    fixture.componentRef.setInput('entry', path.findStep(unitId, stepId));
    fixture.componentInstance.done.subscribe((outcome) => outcomes.push(outcome));
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    outcomes = [];
    drawn.single = null;
    drawn.sequence = [];
  });

  afterEach(() => vi.restoreAllMocks());

  describe('meet', () => {
    it('several new notes: the instruction for many, the note’s name as it is, its hint, and where the learner is', async () => {
      await open(MeetStepComponent, 'rh-1', 'meet');

      expect(text('.lesson-instruction')).toBe('Toto sú tvoje nové noty. Pri každej nájdi modrý kláves a stlač ho 3-krát.');
      expect(text('#mt-name')).toBe('C4');
      expect(text('#mt-hint')).toBe('Stredné C: biely kláves hneď vľavo od dvoch čiernych klávesov, približne v strede klavíra.');
      expect(host.querySelector('#mt-reps')?.getAttribute('aria-label')).toBe('Zahrané: 0, treba: 3');
      expect(text('#mt-reps')).toBe('○○○');
      expect(text('#mt-feedback')).toBe('Nota 1 / 3');
      expect(warn).not.toHaveBeenCalled();
    });

    it('one new note: the instruction for one, and a feedback line that is there but says nothing yet', async () => {
      await open(MeetStepComponent, 'rh-2', 'meet');

      expect(text('.lesson-instruction')).toBe('Toto je tvoja nová nota. Nájdi modrý kláves a stlač ho 3-krát.');
      expect(text('#mt-name')).toBe('G4');
      expect(text('#mt-hint')).toBe('G je medzi prvým a druhým z troch čiernych klávesov.');
      expect(text('#mt-feedback')).toBe('');
      expect(warn).not.toHaveBeenCalled();
    });

    it('answers each press at once, by note name - and in English when the page changes to it in the middle', async () => {
      await open(MeetStepComponent, 'rh-1', 'meet');

      await press(62);
      expect(text('#mt-feedback')).toBe('To bolo D4. Zahraj modrý kláves.');
      await press(60);
      expect(text('#mt-feedback')).toBe('Áno! Ešte raz.');
      expect(host.querySelector('#mt-reps')?.getAttribute('aria-label')).toBe('Zahrané: 1, treba: 3');

      await english();
      expect(text('.lesson-instruction')).toBe('Here are your new notes. Find the blue key and play it 3 times.');
      expect(text('#mt-feedback')).toBe('Yes! Again.');
      expect(host.querySelector('#mt-reps')?.getAttribute('aria-label')).toBe('1 of 3');
      expect(text('#mt-name')).toBe('C4');
      expect(warn).not.toHaveBeenCalled();
    });

    it('reports the moment the last note was played its three times', async () => {
      await open(MeetStepComponent, 'rh-2', 'meet');
      await press(67);
      await press(67);
      expect(outcomes).toEqual([]);
      await press(67);

      expect(text('#mt-feedback')).toBe('To je G4!');
      expect(outcomes).toEqual([{ accuracy: 100, session: null, delayMs: 800 }]);
    });
  });

  describe('drill', () => {
    it('says where the learner is, asks, and answers a right and a wrong key by note name', async () => {
      await open(DrillStepComponent, 'rh-1', 'drill');
      const theory = TestBed.inject(TheoryService);

      expect(text('.lesson-instruction')).toBe('Prečítaj notu na notovej osnove a zahraj ju. Svetlomodré klávesy sú noty, ktoré už poznáš.');
      expect(text('#dr-progress')).toBe('1 / 10 · správne: 0');
      expect(text('#dr-feedback')).toBe('Ktorá nota je to?');

      const target = drawn.single as number;
      const other = target === 60 ? 62 : 60;
      await press(other);
      expect(text('#dr-feedback')).toBe(`To bolo ${theory.midiToName(other)} – toto je ${theory.midiToName(target)}.`);
      expect(text('#dr-progress')).toBe('1 / 10 · správne: 0');

      await english();
      expect(text('#dr-feedback')).toBe(`That was ${theory.midiToName(other)} - this one is ${theory.midiToName(target)}.`);
      expect(text('#dr-progress')).toBe('1 / 10 · 0 correct');
      expect(warn).not.toHaveBeenCalled();
    });

    it('counts a right answer', async () => {
      await open(DrillStepComponent, 'rh-1', 'drill');
      const target = drawn.single as number;
      await press(target);

      expect(text('#dr-feedback')).toMatch(/^Správne – [A-G]\d!$/);
      expect(text('#dr-progress')).toBe('1 / 10 · správne: 1');
    });
  });

  describe('a melody or a song', () => {
    const options = (): string[] => Array.from(host.querySelectorAll('[data-role="bpm"] option')).map((option) => option.textContent?.trim() ?? '');

    it('the song step: the sentence is cut around the song’s title, which stays as it is, in bold', async () => {
      await open(SequenceStepComponent, 'rh-1', 'song');

      expect(text('.lesson-instruction strong')).toBe('Hot Cross Buns');
      expect(text('.lesson-instruction')).toBe(
        'Hot Cross Buns – na dokončenie kroku zahraj túto skladbu s metronómom. Chceš sa ju najprv naučiť? Skús skúšobné kolo bez metronómu (nepočíta sa).',
      );
      expect(text('[data-role="practice"]')).toBe('Skúšobné kolo (bez metronómu)');
      expect(text('[data-role="start"]')).toBe('Hrať s metronómom');
      expect(text('label')).toContain('Tempo:');
      // The song's own tempo is the one that says so; "BPM" is never translated.
      expect(options()).toEqual(['54 BPM', '72 BPM', '90 BPM (pôvodné tempo)']);
      expect(text('[data-role="feedback"]')).toBe('');

      await english();
      expect(text('.lesson-instruction')).toBe(
        "Hot Cross Buns — play it with the metronome to finish the step. Want to learn it first? Use a practice run with no clock (it doesn't count).",
      );
      expect(options()).toEqual(['54 BPM', '72 BPM', '90 BPM (original)']);
      expect(warn).not.toHaveBeenCalled();
    });

    it('draws no title where a language’s sentence leaves its place out', async () => {
      await open(SequenceStepComponent, 'rh-1', 'song', { ...SLOVAK, 'sequence.song.instruction': 'Zahraj túto skladbu s metronómom.' });

      expect(host.querySelector('.lesson-instruction strong')).toBeNull();
      expect(text('.lesson-instruction')).toBe('Zahraj túto skladbu s metronómom.');
    });

    it('a practice run of the song: the player’s words, then the result with its number - and the step is not finished', async () => {
      await open(SequenceStepComponent, 'rh-1', 'song');
      host.querySelector<HTMLButtonElement>('[data-role="practice"]')!.click();
      await stable();
      expect(text('[data-role="feedback"]')).toBe('Zahraj modrú notu. Neponáhľaj sa – metronóm tu nebeží.');

      const [first, ...rest] = drawn.sequence;
      await press(first === 60 ? 62 : 60);
      expect(text('[data-role="feedback"]')).toMatch(/^To bolo (C4|D4) – skús to znova\.$/);
      await press(first);
      expect(text('[data-role="feedback"]')).toBe('Máš to.');
      for (const midi of rest) await press(midi);

      // 16 of the 17 notes at the first try.
      expect(text('[data-role="feedback"]')).toBe('Skúšobné kolo: 94 %. Keď budeš chcieť, zahraj to s metronómom.');
      expect(host.querySelector('[data-role="feedback"]')?.classList.contains('feedback--correct')).toBe(true);
      expect(outcomes).toEqual([]);

      await english();
      expect(text('[data-role="feedback"]')).toBe("Practice run: 94%. When you're ready, play it with the metronome.");
      expect(warn).not.toHaveBeenCalled();
    });

    it('reading a melody: it starts by itself, and ends with the result as one sentence', async () => {
      await open(SequenceStepComponent, 'rh-1', 'read');
      expect(text('.lesson-instruction')).toBe('Zahraj melódiu zľava doprava. Bez metronómu – pri každej note sa neponáhľaj.');
      expect(text('[data-role="feedback"]')).toBe('Zahraj modrú notu. Neponáhľaj sa – metronóm tu nebeží.');

      expect(drawn.sequence).toHaveLength(8);
      await press(drawn.sequence[0]);
      expect(text('[data-role="feedback"]')).toBe('Dobre!');
      for (const midi of drawn.sequence.slice(1)) await press(midi);

      expect(text('[data-role="feedback"]')).toBe('Hotovo – správne 8 / 8 (100 %).');
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({ accuracy: 100, delayMs: 900 });

      await english();
      expect(text('[data-role="feedback"]')).toBe('Done - 8/8 correct (100%).');
      expect(warn).not.toHaveBeenCalled();
    });

    it('playing in time: the tempo list without an "original", and a Start that becomes Restart', async () => {
      await open(SequenceStepComponent, 'rh-1', 'tempo');

      expect(text('.lesson-instruction')).toBe('Teraz zahraj melódiu v rytme. Vypočuj si 4 kliky a potom zahraj na každý klik jednu notu.');
      expect(options()).toEqual(['50 BPM', '60 BPM', '70 BPM', '80 BPM']);
      expect(text('[data-role="start"]')).toBe('Štart');
      expect(text('[data-role="feedback"]')).toBe('');
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
