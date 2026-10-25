import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { SelectComponent, SelectOption } from '@anotoki/lib/ui/select';
import { MidiService } from '../../../../shared/midi/midi.service';
import { PathService } from '../../../../shared/music/path.service';
import { SrsService } from '../../../../shared/music/srs.service';
import { TheoryService } from '../../../../shared/music/theory.service';
import { SequencePlayer, sessionFieldsFromResult } from '../../common/player/sequence-player';
import { ProgressStore } from '../../../../shared/state/progress-store.service';
import { NotationComponent } from '../../common/notation/notation.component';
import { KeyboardModel } from '../../common/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../common/piano-keyboard/piano-keyboard.component';
import { Feedback } from '../lesson/step-outcome';

const SEQUENCE_LENGTH = 6;
const MIN_KNOWN_NOTES = 3;

/**
 * Sheet Practice: a short piece made from the notes the learner knows (the
 * treble ones, for now), sight-read along with the metronome - pitch and
 * timing graded, the round logged. The card, the tempo (the family's select)
 * and the buttons are the family's; the practice screen is Piano's own.
 */
@Component({
  selector: 'app-sheet-page',
  templateUrl: './sheet-page.component.html',
  styleUrl: './sheet-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotationComponent, PianoKeyboardComponent, TranslatePipe, TranslatePluralPipe, ButtonComponent, CardComponent, SelectComponent],
})
export class SheetPageComponent {
  private readonly midi = inject(MidiService);
  private readonly theory = inject(TheoryService);
  private readonly srs = inject(SrsService);
  private readonly path = inject(PathService);
  private readonly store = inject(ProgressStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);

  private readonly staff = viewChild(NotationComponent);
  protected readonly keyboard = new KeyboardModel();
  protected readonly minKnown = MIN_KNOWN_NOTES;
  protected readonly tempos = [60, 70, 80, 100, 120];
  /** The tempos as the select's choices, in the page's language ("80 BPM"). */
  protected readonly tempoOptions = computed<SelectOption<number>[]>(() => this.tempos.map((tempo) => ({ value: tempo, label: this.i18n.t('tempo.bpm', { bpm: tempo }) })));

  /** The known notes it may use, in a shuffled order - fixed while the page is open. */
  protected readonly knownTreble = this.path.shuffle(this.store.knownNotes().filter((midi) => midi >= 60));
  /** Note names: the same in every language. */
  protected readonly knownNames = this.knownTreble.map((midi) => this.theory.midiToName(midi)).join(', ');
  protected readonly bpm = signal(80);
  protected readonly playing = signal(false);
  /** A key and its values, never a sentence: the template words it. */
  protected readonly feedback = signal<Feedback>({ key: 'sheet.ready', kind: null });

  private player: SequencePlayer | null = null;

  constructor() {
    this.keyboard.markKnown(this.store.knownNotes());
    afterNextRender(() => this.begin());
    inject(DestroyRef).onDestroy(() => this.player?.destroy());
  }

  private begin(): void {
    const staff = this.staff();
    if (!staff || this.knownTreble.length < MIN_KNOWN_NOTES) return;
    this.player = new SequencePlayer({
      midi: this.midi.piano,
      srs: this.srs,
      theory: this.theory,
      store: this.store,
      notation: staff.notation(),
      keyboard: this.keyboard,
      feedback: (key, params, kind = null) => this.feedback.set({ key, params, kind }),
      onFinish: (result) => {
        this.playing.set(false);
        this.store.recordSession({ mode: 'sheet', ...sessionFieldsFromResult(result) }).catch((error) => console.error('Failed to record session', error));
      },
    });
    this.loadNewSheet();
  }

  /** A new piece: never the same note twice in a row (when there is a choice). */
  private generateSequence(): number[] {
    const sequence: number[] = [];
    let last: number | null = null;
    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
      let pick: number;
      do {
        pick = this.knownTreble[Math.floor(Math.random() * this.knownTreble.length)];
      } while (pick === last && this.knownTreble.length > 1);
      sequence.push(pick);
      last = pick;
    }
    return sequence;
  }

  private loadNewSheet(): void {
    this.player?.load(this.generateSequence().map((midi) => ({ midi })));
    this.playing.set(false);
  }

  protected newSheet(): void {
    this.loadNewSheet();
    this.feedback.set({ key: 'sheet.newReady', kind: null });
  }

  protected chooseTempo(value: number): void {
    this.bpm.set(value);
  }

  protected start(): void {
    this.playing.set(true);
    this.player?.start({ mode: 'tempo', bpm: this.bpm() });
  }

  protected goToPath(): void {
    void this.router.navigateByUrl('/');
  }
}
