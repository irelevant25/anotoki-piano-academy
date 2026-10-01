import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MidiProblemKind, MidiService } from '../../core/midi/midi.service';

/** Why there is no piano, as a sentence of the app's own: the kind's key, written out whole. */
const PROBLEM_KEYS: Record<MidiProblemKind, string> = {
  unsupported: 'midi.unsupported',
  refused: 'midi.refused',
  failed: 'midi.failed',
};

/** Nothing went wrong: there is just no piano connected. */
const NOT_CONNECTED = 'midi.notConnected';

/**
 * The piano, in the header: whether it is connected, the MIDI devices the
 * browser offers, Connect, and ⟳ to look for devices again.
 *
 * MidiService says what is the case - connected and the device's name, or the
 * kind of a problem and its detail - and the words are chosen here. A device's
 * name is never translated; the detail of a problem is the browser's own
 * English (or PianoMidi's), shown after the app's sentence and marked
 * lang="en".
 */
@Component({
  selector: 'app-midi-panel',
  templateUrl: './midi-panel.component.html',
  styleUrl: './midi-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class MidiPanelComponent {
  protected readonly midi = inject(MidiService);

  /** The key of what is said while no piano is connected. */
  protected readonly problemKey = computed(() => {
    const kind = this.midi.problem()?.kind;
    return kind !== undefined && Object.hasOwn(PROBLEM_KEYS, kind) ? PROBLEM_KEYS[kind] : NOT_CONNECTED;
  });

  protected choose(event: Event): void {
    this.midi.selectedId.set((event.target as HTMLSelectElement).value);
  }
}
