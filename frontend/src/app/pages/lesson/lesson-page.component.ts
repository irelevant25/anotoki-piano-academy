import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslationParams, TranslationService } from '@anotoki/lib/translations';
import { phaseTitle, stepShort, stepTitle, unitTitle } from '../../core/i18n/path-words';
import { PathStep, StepRecord } from '../../core/music/music.types';
import { PASS_ACCURACY, PathService, STEP_TYPES } from '../../core/music/path.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { StepOutcome } from './step-outcome';
import { DrillStepComponent } from './steps/drill-step.component';
import { MeetStepComponent } from './steps/meet-step.component';
import { SequenceStepComponent } from './steps/sequence-step.component';

/** What the result screen shows. Its words are keys (with their values): the template words them. */
interface ResultView {
  accuracy: number;
  open: boolean;
  message: { key: string; params?: TranslationParams };
  lastForNow: boolean;
  next: PathStep | null;
  /** The key of what the button to the next step says. */
  nextLabel: string;
  isMeet: boolean;
}

/**
 * One learning-path step (/lesson/:unitId/:stepId), then its result: passing
 * (best accuracy >= PASS_ACCURACY) opens the next step, otherwise the learner
 * tries again. Each step type has its own component; all of them report the
 * moment an attempt ends (StepOutcome) and stop listening to the piano.
 */
@Component({
  selector: 'app-lesson-page',
  templateUrl: './lesson-page.component.html',
  styleUrl: './lesson-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MeetStepComponent, DrillStepComponent, SequenceStepComponent, TranslatePipe],
})
export class LessonPageComponent {
  private readonly router = inject(Router);
  private readonly store = inject(ProgressStore);
  private readonly i18n = inject(TranslationService);
  private readonly path = inject(PathService);

  /** From the address (withComponentInputBinding). */
  readonly unitId = input<string>();
  readonly stepId = input<string>();

  protected readonly entry = computed(() => this.path.findStep(this.unitId(), this.stepId()));
  protected readonly unlocked = computed(() => {
    const entry = this.entry();
    return !!entry && this.path.isStepUnlocked(this.store.pathProgress(), entry.key);
  });
  /** The step, when it may be played: every step before it passed. */
  protected readonly openStep = computed(() => (this.unlocked() ? this.entry() : null));
  /**
   * The line above the heading and the heading, each one sentence of the
   * app's strings: the phase's, the unit's and the step's names are its
   * values, found in PathService by the address and worded from their own ids.
   */
  protected readonly head = computed(() => {
    const entry = this.entry();
    if (!entry) return { tag: '', heading: '' };
    return {
      tag: this.i18n.t('lesson.tag', { phase: phaseTitle(this.i18n, entry.phase), number: entry.unit.number }),
      heading: this.i18n.t('lesson.heading', { unit: unitTitle(this.i18n, entry.unit), step: stepTitle(this.i18n, entry.step.type) }),
    };
  });
  protected readonly dots = computed(() => {
    const entry = this.entry();
    if (!entry) return [];
    return entry.unit.steps.map((step) => ({
      id: step.id,
      short: stepShort(this.i18n, step.type),
      current: step.id === entry.step.id,
      passed: this.path.isStepPassed(this.store.pathProgress(), this.path.stepKey(entry.unit.id, step.id)),
    }));
  });

  /** Changes to start the step afresh: a new attempt is a new step component. */
  protected readonly attempt = signal(0);
  protected readonly result = signal<ResultView | null>(null);
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private shownKey: string | null = null;

  constructor() {
    // Next and Continue open another step on this same page: start it afresh.
    effect(() => {
      const key = this.entry()?.key ?? null;
      untracked(() => {
        if (this.shownKey !== null && key !== this.shownKey) this.restart();
        this.shownKey = key;
      });
    });
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  private clearTimer(): void {
    if (this.resultTimer !== null) clearTimeout(this.resultTimer);
    this.resultTimer = null;
  }

  protected restart(): void {
    this.clearTimer();
    this.result.set(null);
    this.attempt.update((n) => n + 1);
  }

  /** An attempt ended: saved now; the result screen after the step's pause. */
  protected finish(outcome: StepOutcome): void {
    const entry = this.entry();
    if (!entry || this.resultTimer !== null) return;
    const { unit, step, key } = entry;
    const before = this.store.pathProgress();
    const wasPassed = this.path.isStepPassed(before, key);
    const updated = this.path.recordStepResult(before, key, outcome.accuracy);
    this.store.savePathProgress(updated).catch((error) => console.error('Failed to save path progress', error));
    if (outcome.session) {
      // The label kept with the session is data, in English whatever the page's language: PathService's own
      // two values, never t(). Stats words a row from the ids beside it, and shows this only when they are gone.
      this.store
        .recordSession({ ...outcome.session, mode: 'lesson', label: `${unit.title} · ${STEP_TYPES[step.type].short}`, unitId: unit.id, stepId: step.id })
        .catch((error) => console.error('Failed to record session', error));
    }
    const record = this.path.getStepRecord(updated, key);
    this.resultTimer = setTimeout(() => {
      this.resultTimer = null;
      this.result.set(this.resultView(entry, outcome.accuracy, wasPassed, record));
    }, outcome.delayMs);
  }

  private resultView(entry: PathStep, accuracy: number, wasPassed: boolean, record: StepRecord | null): ResultView {
    const passedNow = accuracy >= PASS_ACCURACY;
    const open = passedNow || wasPassed;
    const next = this.path.getStepAfter(entry.key);
    const finishesUnit = open && (!next || next.unit.id !== entry.unit.id);

    let message: ResultView['message'];
    if (entry.step.type === 'meet') message = { key: 'lesson.result.met' };
    else if (passedNow && finishesUnit) message = { key: 'lesson.result.unitComplete', params: { unit: entry.unit.number } };
    else if (passedNow) message = { key: 'lesson.result.passed' };
    else if (wasPassed) message = { key: 'lesson.result.bestKept', params: { best: record?.bestAccuracy ?? accuracy } };
    else message = { key: 'lesson.result.needed', params: { pass: PASS_ACCURACY } };

    return {
      accuracy,
      open,
      message,
      lastForNow: open && !next,
      next: open ? next : null,
      nextLabel: next && next.unit.id === entry.unit.id ? 'lesson.result.continue' : 'lesson.result.nextUnit',
      isMeet: entry.step.type === 'meet',
    };
  }

  protected goNext(next: PathStep): void {
    void this.router.navigate(['/lesson', next.unit.id, next.step.id]);
  }

  protected backToPath(): void {
    void this.router.navigateByUrl('/');
  }
}
