import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
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
  state: 'passed' | 'open' | 'locked';
}

interface UnitView {
  unit: Unit;
  status: UnitStatus;
  details: string;
  chips: ChipView[];
}

interface PhaseView {
  phase: Phase;
  units: UnitView[];
}

/**
 * "Learn": the learning path. A Continue button for the next step, every phase
 * with its units and their step chips (passed / open / locked), the notes due
 * for review, and the free-practice modes underneath.
 */
@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly router = inject(Router);
  private readonly store = inject(ProgressStore);
  private readonly srs = inject(SrsService);
  private readonly theory = inject(TheoryService);
  protected readonly path = inject(PathService);

  protected readonly next = computed<PathStep | null>(() => this.path.getNextStep(this.store.pathProgress()));
  protected readonly started = computed(() => this.path.pathSteps.some((entry) => this.path.isStepPassed(this.store.pathProgress(), entry.key)));
  protected readonly dueCount = computed(() => this.srs.countDueNotes(this.store.progress(), this.theory.curriculum));

  protected readonly phases = computed<PhaseView[]>(() => {
    const progress = this.store.pathProgress();
    return this.path.phases.map((phase) => ({
      phase,
      units: phase.units.map((unit) => {
        const songStep = unit.steps.find((step) => step.type === 'song');
        const song = songStep ? this.path.songForStep(songStep) : null;
        const details = [
          unit.newNotes.length ? `New: ${unit.newNotes.map((midi) => this.theory.midiToName(midi)).join(', ')}` : 'Review',
          song ? `Song: ${song.title}` : null,
        ].filter(Boolean).join(' · ');

        const chips = unit.steps.map((step): ChipView => {
          const key = this.path.stepKey(unit.id, step.id);
          const passed = this.path.isStepPassed(progress, key);
          const unlocked = this.path.isStepUnlocked(progress, key);
          const record = this.path.getStepRecord(progress, key);
          const type = this.path.stepTypes[step.type];
          const score = passed && step.type !== 'meet' && record ? ` ${record.bestAccuracy}%` : '';
          const icon = passed ? '✓ ' : unlocked ? '▶ ' : '';
          return {
            key,
            unitId: unit.id,
            stepId: step.id,
            label: `${icon}${type.short}${score}`,
            title: type.title,
            state: passed ? 'passed' : unlocked ? 'open' : 'locked',
          };
        });

        return { unit, status: this.path.getUnitStatus(progress, unit), details, chips };
      }),
    }));
  });

  protected stepTitle(entry: PathStep): string {
    return this.path.stepTypes[entry.step.type].title;
  }

  protected open(unitId: string, stepId: string): void {
    void this.router.navigate(['/lesson', unitId, stepId]);
  }

  protected go(path: string): void {
    void this.router.navigateByUrl(path);
  }
}
