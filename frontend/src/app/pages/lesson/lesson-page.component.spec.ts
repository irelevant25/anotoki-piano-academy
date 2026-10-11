import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import type { MockInstance } from 'vitest';
import { PathProgress, PathStep, SessionInput } from '../../core/music/music.types';
import { PathService } from '../../core/music/path.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { LessonPageComponent } from './lesson-page.component';
import { StepOutcome } from './step-outcome';
import { DrillStepComponent } from './steps/drill-step.component';
import { MeetStepComponent } from './steps/meet-step.component';
import { SequenceStepComponent } from './steps/sequence-step.component';

const ENGLISH: Record<string, string> = {
  'common.percent': '{value}%',
  'lesson.back': 'Path',
  'lesson.tag': '{phase} · Unit {number}',
  'lesson.heading': '{unit} — {step}',
  'lesson.backToPath': 'Back to the path',
  'lesson.locked.title': 'This step is locked',
  'lesson.locked.text': 'Finish the earlier steps on the path first.',
  'lesson.result.met': "You met the new notes. Now let's see if you can find them without help.",
  'lesson.result.unitComplete': 'Unit {unit} complete! 🎉',
  'lesson.result.passed': 'Step passed - nice work!',
  'lesson.result.bestKept': 'Not this time, but your best is {best}%, so the path stays open.',
  'lesson.result.needed': 'You need {pass}% to continue. Give it another try - it gets easier every time.',
  'lesson.result.lastForNow': 'That was the last unit for now - more are coming.',
  'lesson.result.continue': 'Continue',
  'lesson.result.nextUnit': 'Next unit',
  'lesson.result.practiceAgain': 'Practice again',
  'lesson.result.tryAgain': 'Try again',
  'path.phase.right-hand.title': 'Right hand',
  'path.unit.rh-5.title': 'B and high C',
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
};

const SLOVAK: Record<string, string> = {
  'common.percent': '{value} %',
  'lesson.back': 'Cesta',
  'lesson.tag': '{phase} · Lekcia {number}',
  'lesson.heading': '{unit} – {step}',
  'lesson.backToPath': 'Späť na cestu',
  'lesson.locked.title': 'Tento krok je zamknutý',
  'lesson.locked.text': 'Najprv dokonči predchádzajúce kroky na ceste.',
  'lesson.result.met': 'Nové noty už poznáš. Teraz skús, či ich nájdeš aj bez pomoci.',
  'lesson.result.unitComplete': 'Lekcia {unit} je hotová! 🎉',
  'lesson.result.passed': 'Krok je splnený – pekná práca!',
  'lesson.result.bestKept': 'Tentoraz to nevyšlo, ale tvoj najlepší výsledok je {best} %, takže cesta zostáva otvorená.',
  'lesson.result.needed': 'Na pokračovanie treba {pass} %. Skús to ešte raz – každým pokusom to ide ľahšie.',
  'lesson.result.lastForNow': 'To bola zatiaľ posledná lekcia – ďalšie pribudnú.',
  'lesson.result.continue': 'Pokračovať',
  'lesson.result.nextUnit': 'Ďalšia lekcia',
  'lesson.result.practiceAgain': 'Cvičiť znova',
  'lesson.result.tryAgain': 'Skúsiť znova',
  'path.phase.right-hand.title': 'Pravá ruka',
  'path.unit.rh-5.title': 'B a vysoké C',
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
};

/** A step's place on the page, without the piano or the staff: the spec ends its attempt by hand. */
@Component({ selector: 'app-meet-step, app-drill-step, app-sequence-step', template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class StepStubComponent {
  readonly entry = input.required<PathStep>();
  readonly done = output<StepOutcome>();
}

describe('Lesson page: its words are keys, and what it stores stays as it was', () => {
  let fixture: ComponentFixture<LessonPageComponent>;
  let host: HTMLElement;
  let path: PathService;
  let warn: MockInstance;
  let recorded: SessionInput[];
  const pathProgress = signal<PathProgress>({ steps: {} });

  const text = (selector: string): string | null => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const dots = (): string[] => Array.from(host.querySelectorAll('.step-dots li')).map((dot) => dot.textContent?.trim() ?? '');

  /** The steps of the path before `unitId/stepId`, all passed. */
  function passedBefore(unitId: string, stepId: string): PathProgress {
    let progress = path.createInitialPathProgress();
    for (const entry of path.pathSteps) {
      if (entry.key === path.stepKey(unitId, stepId)) break;
      progress = path.recordStepResult(progress, entry.key, 100);
    }
    return progress;
  }

  async function open(unitId: string, stepId: string, passed = true): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        {
          provide: ProgressStore,
          useValue: {
            pathProgress,
            savePathProgress: (progress: PathProgress) => {
              pathProgress.set(progress);
              return Promise.resolve();
            },
            recordSession: (session: SessionInput) => {
              recorded.push(session);
              return Promise.resolve({});
            },
          },
        },
      ],
    });
    TestBed.overrideComponent(LessonPageComponent, {
      remove: { imports: [MeetStepComponent, DrillStepComponent, SequenceStepComponent] },
      add: { imports: [StepStubComponent] },
    });
    path = TestBed.inject(PathService);
    pathProgress.set(passed ? passedBefore(unitId, stepId) : path.createInitialPathProgress());
    fixture = TestBed.createComponent(LessonPageComponent);
    host = fixture.nativeElement;
    fixture.componentRef.setInput('unitId', unitId);
    fixture.componentRef.setInput('stepId', stepId);
    await fixture.whenStable();
  }

  /** The step on the page reports its attempt; the result screen comes after the step's pause. */
  async function finish(accuracy: number, session: StepOutcome['session'] = { attempts: 10, correct: Math.round(accuracy / 10), accuracy }): Promise<void> {
    (fixture.debugElement.query(By.directive(StepStubComponent)).componentInstance as StepStubComponent).done.emit({ accuracy, session, delayMs: 0 });
    await new Promise((done) => setTimeout(done, 5));
    await fixture.whenStable();
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    recorded = [];
  });

  afterEach(() => vi.restoreAllMocks());

  it('names the phase, the unit and the step in the language of the page', async () => {
    await open('rh-1', 'meet');

    expect(text('.lesson-title .lesson-tag')).toBe('Pravá ruka · Lekcia 1');
    // A unit title of note letters only is shown as it is.
    expect(text('h2')).toBe('C, D, E – Zoznám sa s notami');
    expect(dots()).toEqual(['Zoznámenie', 'Precvičovanie', 'Čítanie', 'V rytme', 'Skladba']);
    // Back to the path: the family's button, its arrow the kit's icon.
    expect(text('#ls-back')).toBe('Cesta');
    expect(host.querySelector('#ls-back anotoki-icon')?.getAttribute('name')).toBe('arrowLeft');
    expect(warn).not.toHaveBeenCalled();
  });

  it('after meeting the notes: no score, one sentence, and on to the next step', async () => {
    await open('rh-1', 'meet');
    await finish(100, null);

    expect(host.querySelector('.result-score')).toBeNull();
    expect(text('.result-message')).toBe('Nové noty už poznáš. Teraz skús, či ich nájdeš aj bez pomoci.');
    expect(text('#ls-next')).toBe('Pokračovať');
    expect(text('#ls-retry')).toBe('Cvičiť znova');
    expect(text('#ls-path')).toBe('Späť na cestu');
    expect(recorded).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('under the pass mark: what is needed, and only "try again" - then passed, then the best is kept', async () => {
    await open('rh-1', 'drill');
    await finish(60);
    expect(text('.result-score')).toBe('60 %');
    expect(text('.result-message')).toBe('Na pokračovanie treba 80 %. Skús to ešte raz – každým pokusom to ide ľahšie.');
    expect(host.querySelector('#ls-next')).toBeNull();
    expect(text('#ls-retry')).toBe('Skúsiť znova');
    // Trying again is the one thing to do: the family's large primary button.
    expect(host.querySelector('#ls-retry')?.classList).toContain('anotoki-button--primary');
    expect(host.querySelector('#ls-retry')?.classList).toContain('anotoki-button--lg');

    host.querySelector<HTMLButtonElement>('#ls-retry')!.click();
    await fixture.whenStable();
    await finish(90);
    expect(text('.result-score')).toBe('90 %');
    expect(text('.result-message')).toBe('Krok je splnený – pekná práca!');
    expect(text('#ls-next')).toBe('Pokračovať');
    // Passed: going on is the large primary button, practising again an ordinary one.
    expect(host.querySelector('#ls-next')?.classList).toContain('anotoki-button--primary');
    expect(host.querySelector('#ls-retry')?.classList).toContain('anotoki-button--secondary');
    expect(host.querySelector('#ls-retry')?.classList).not.toContain('anotoki-button--lg');

    host.querySelector<HTMLButtonElement>('#ls-retry')!.click();
    await fixture.whenStable();
    await finish(50);
    expect(text('.result-message')).toBe('Tentoraz to nevyšlo, ale tvoj najlepší výsledok je 90 %, takže cesta zostáva otvorená.');
    expect(text('#ls-retry')).toBe('Cvičiť znova');
    expect(warn).not.toHaveBeenCalled();
  });

  it('the last step of a unit: the unit is complete, and the next button goes to the next unit', async () => {
    await open('rh-1', 'song');
    await finish(100);

    expect(text('.result-message')).toBe('Lekcia 1 je hotová! 🎉');
    expect(text('#ls-next')).toBe('Ďalšia lekcia');
    expect(host.textContent).not.toContain('To bola zatiaľ posledná lekcia');
  });

  it('the last step of the path: nothing comes next for now', async () => {
    await open('rh-5', 'song');
    expect(text('h2')).toBe('B a vysoké C – Skladba');
    await finish(100);

    expect(text('.result-message')).toBe('Lekcia 5 je hotová! 🎉');
    expect(host.querySelector('#ls-next')).toBeNull();
    expect(host.textContent).toContain('To bola zatiaľ posledná lekcia – ďalšie pribudnú.');
  });

  it('keeps the label it stores with a session in English, whatever language the page is in', async () => {
    await open('rh-5', 'drill');
    expect(text('h2')).toBe('B a vysoké C – Precvičovanie nôt');
    await finish(80);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ mode: 'lesson', label: 'B and high C · Drill', unitId: 'rh-5', stepId: 'drill', accuracy: 80 });
  });

  it('says the result again in the language the page changes to', async () => {
    await open('rh-5', 'drill');
    await finish(40);
    expect(text('.result-message')).toBe('Na pokračovanie treba 80 %. Skús to ešte raz – každým pokusom to ide ľahšie.');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(text('.lesson-title .lesson-tag')).toBe('Right hand · Unit 5');
    expect(text('h2')).toBe('B and high C — Note drill');
    expect(dots()).toEqual(['Meet', 'Drill', 'Read', 'In time', 'Song']);
    expect(text('.result-score')).toBe('40%');
    expect(text('.result-message')).toBe('You need 80% to continue. Give it another try - it gets easier every time.');
    expect(text('#ls-retry')).toBe('Try again');
    expect(text('#ls-path')).toBe('Back to the path');
    expect(warn).not.toHaveBeenCalled();
  });

  it('a step opened before the ones before it are passed is locked, in words', async () => {
    await open('rh-2', 'drill', false);

    expect(text('h2')).toBe('Tento krok je zamknutý');
    expect(text('p')).toBe('Najprv dokonči predchádzajúce kroky na ceste.');
    expect(text('#ls-path')).toBe('Späť na cestu');
    expect(host.querySelector('#ls-body')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
