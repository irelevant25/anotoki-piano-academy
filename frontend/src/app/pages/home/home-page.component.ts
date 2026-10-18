import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { ChipComponent, type ChipTone } from '@anotoki/lib/ui/chips';
import { phaseDescription, phaseTitle, stepShort, stepTitle, unitTitle } from '../../core/i18n/path-words';
import { PathStep, Phase, Unit } from '../../core/music/music.types';
import { PathService, UnitStatus } from '../../core/music/path.service';
import { SrsService } from '../../core/music/srs.service';
import { TheoryService } from '../../core/music/theory.service';
import { ProgressStore } from '../../core/state/progress-store.service';

interface ChipView {
  key: string;
  unitId: string;
  stepId: string;
  label: string;
  title: string;
  state: StepState;
  /** The family's chip's colour for the state (the ✓ or ▶ before the words says it too). */
  tone: ChipTone;
}

type StepState = 'passed' | 'open' | 'locked';

/** A step's state as the family's chip draws it: passed green, open blue, locked the quiet one (and off). */
const STEP_TONES: Readonly<Record<StepState, ChipTone>> = { passed: 'success', open: 'primary', locked: 'neutral' };

interface UnitView {
  unit: Unit;
  /** The unit's title as the learner reads it (unitTitle()). */
  title: string;
  status: UnitStatus;
  details: string;
  chips: ChipView[];
}

interface PhaseView {
  phase: Phase;
  title: string;
  description: string;
  units: UnitView[];
}

/**
 * "Learn": the learning path. A Continue button for the next step, every phase
 * with its units and their step chips (passed / open / locked), the notes due
 * for review, and the free-practice modes underneath. The cards - the call to
 * go on is the card's highlight -, the review's note, "Coming soon", the
 * buttons and the step chips (@anotoki/lib/ui/chips, anotoki-lib 0.6.0) are
 * the family's kit; the path itself - the phases' heads, the units and their
 * badges - is Piano's own, in the family's tokens.
 *
 * The words are the language's: what `phases`, `due` and `nextWords` hold is
 * worded inside a computed() - t() reads signals, so it is worded again when
 * the language changes - and the rest in the template. Note names and song
 * titles go in as they are.
 */
@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AlertComponent, BadgeComponent, ButtonComponent, CardComponent, ChipComponent],
})
export class HomePageComponent {
  private readonly router = inject(Router);
  private readonly store = inject(ProgressStore);
  private readonly srs = inject(SrsService);
  private readonly theory = inject(TheoryService);
  private readonly i18n = inject(TranslationService);
  protected readonly path = inject(PathService);

  protected readonly next = computed<PathStep | null>(() => this.path.getNextStep(this.store.pathProgress()));
  protected readonly started = computed(() => this.path.pathSteps.some((entry) => this.path.isStepPassed(this.store.pathProgress(), entry.key)));
  protected readonly dueCount = computed(() => this.srs.countDueNotes(this.store.progress(), this.theory.curriculum));

  /**
   * "3 notes are due for review.", cut around its number, which is drawn in
   * bold: what stands before it, what after, and whether the sentence names
   * the number at all (a language may leave it out of a form - then the whole
   * sentence is the first part, and no number is drawn).
   */
  protected readonly due = computed(() => this.i18n.aroundPlural('home.due', this.dueCount(), 'count'));

  /** The next step's unit and the step itself, in words: what the Continue card names. */
  protected readonly nextWords = computed(() => {
    const next = this.next();
    return next ? { unit: unitTitle(this.i18n, next.unit), step: stepTitle(this.i18n, next.step.type) } : null;
  });

  protected readonly phases = computed<PhaseView[]>(() => {
    const progress = this.store.pathProgress();
    return this.path.phases.map((phase) => ({
      phase,
      title: phaseTitle(this.i18n, phase),
      description: phaseDescription(this.i18n, phase),
      units: phase.units.map((unit) => {
        const songStep = unit.steps.find((step) => step.type === 'song');
        const song = songStep ? this.path.songForStep(songStep) : null;
        const details = [
          unit.newNotes.length ? this.i18n.t('home.unit.new', { notes: unit.newNotes.map((midi) => this.theory.midiToName(midi)).join(', ') }) : this.i18n.t('home.unit.review'),
          song ? this.i18n.t('home.unit.song', { title: song.title }) : null,
        ]
          .filter(Boolean)
          .join(' · ');

        const chips = unit.steps.map((step): ChipView => {
          const key = this.path.stepKey(unit.id, step.id);
          const passed = this.path.isStepPassed(progress, key);
          const unlocked = this.path.isStepUnlocked(progress, key);
          const record = this.path.getStepRecord(progress, key);
          const score = passed && step.type !== 'meet' && record ? ` ${this.i18n.t('common.percent', { value: record.bestAccuracy })}` : '';
          const icon = passed ? '✓ ' : unlocked ? '▶ ' : '';
          const state: StepState = passed ? 'passed' : unlocked ? 'open' : 'locked';
          return {
            key,
            unitId: unit.id,
            stepId: step.id,
            label: `${icon}${stepShort(this.i18n, step.type)}${score}`,
            title: stepTitle(this.i18n, step.type),
            state,
            tone: STEP_TONES[state],
          };
        });

        return { unit, title: unitTitle(this.i18n, unit), status: this.path.getUnitStatus(progress, unit), details, chips };
      }),
    }));
  });

  protected open(unitId: string, stepId: string): void {
    void this.router.navigate(['/lesson', unitId, stepId]);
  }

  protected go(path: string): void {
    void this.router.navigateByUrl(path);
  }
}
