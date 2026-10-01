import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TheoryService } from '../../core/music/theory.service';
import { KeyboardModel } from './keyboard-model';

const WHITE_KEY_WIDTH = 34;
const WHITE_KEY_HEIGHT = 130;
const BLACK_KEY_WIDTH = 20;
const BLACK_KEY_HEIGHT = 82;

interface DrawnKey {
  midi: number;
  name: string;
  x: number;
}

/**
 * The on-screen piano keyboard: an SVG that scales to its box, with every key
 * lit as its KeyboardModel says - the target, a right or wrong press, the
 * notes known, or (on Stats) each note's mastery. Each key carries data-midi
 * and data-name for the browser tests. A screen reader hears it named by
 * the key keyboard.label, in the page's language.
 */
@Component({
  selector: 'app-piano-keyboard',
  imports: [TranslatePipe],
  templateUrl: './piano-keyboard.component.html',
  styleUrl: './piano-keyboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianoKeyboardComponent {
  private readonly theory = inject(TheoryService);

  readonly model = input.required<KeyboardModel>();
  readonly lowMidi = input(48);
  readonly highMidi = input(84);

  protected readonly whiteWidth = WHITE_KEY_WIDTH;
  protected readonly whiteHeight = WHITE_KEY_HEIGHT;
  protected readonly blackWidth = BLACK_KEY_WIDTH;
  protected readonly blackHeight = BLACK_KEY_HEIGHT;

  protected readonly layout = computed(() => {
    const low = this.lowMidi();
    const high = this.highMidi();
    const whiteX = new Map<number, number>();
    const whites: DrawnKey[] = [];
    for (let midi = low; midi <= high; midi++) {
      if (this.theory.isWhiteKey(midi)) {
        whiteX.set(midi, whites.length * WHITE_KEY_WIDTH);
        whites.push({ midi, name: this.theory.midiToName(midi), x: whites.length * WHITE_KEY_WIDTH });
      }
    }

    const blacks: DrawnKey[] = [];
    for (let midi = low; midi <= high; midi++) {
      if (this.theory.isWhiteKey(midi)) continue;
      const below = whiteX.get(midi - 1);
      const whiteBelow = below !== undefined ? below : (whiteX.get(midi + 1) ?? 0) - WHITE_KEY_WIDTH;
      blacks.push({ midi, name: this.theory.midiToName(midi), x: whiteBelow + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2 });
    }

    return { width: whites.length * WHITE_KEY_WIDTH, whites, blacks };
  });

  /** A key's classes, from the model: what it is, whether it is known, how it is lit. */
  protected keyClass(midi: number, kind: 'white' | 'black'): string {
    const model = this.model();
    const state = model.states().get(midi);
    const level = model.levels().get(midi);
    return `piano-key piano-key--${kind}`
      + (model.known().has(midi) ? ' is-known' : '')
      + (state ? ` is-${state}` : '')
      + (level ? ` lvl-${level}` : '');
  }
}
