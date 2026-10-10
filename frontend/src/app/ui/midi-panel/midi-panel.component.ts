import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { PopoverComponent, PopoverTriggerDirective } from '@anotoki/lib/ui/menu';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
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
 * The piano, in the top bar - Piano Academy's widget in the family's bar,
 * just left of the language: a round-ended button with a dot (green:
 * connected; amber: not), the piano's icon and, on a wide bar, the device's
 * name (or "No piano"). On a phone (`compact`) the dot and the icon alone.
 *
 * The button opens a box under it with the whole state: the status sentence,
 * the MIDI devices the browser offers, Connect, and Rescan. It is the
 * family's popover (@anotoki/lib/ui/menu) - a disclosure, not a menu (it
 * holds a list and buttons): the focus goes to the device list when it
 * opens; Escape closes it and gives the focus back to the button; a click
 * outside, or the focus leaving it, closes it; it is drawn over the page,
 * under the button, and kept on the screen at 360 px.
 *
 * MidiService says what is the case - connected and the device's name, or the
 * kind of a problem and its detail - and the words are chosen here. A device's
 * name is never translated; the detail of a problem is the browser's own
 * English (or PianoMidi's), shown after the app's sentence and marked
 * lang="en". The button's name and title hold the state's sentence in every
 * state; the box is drawn while it is open.
 */
@Component({
  selector: 'app-midi-panel',
  templateUrl: './midi-panel.component.html',
  styleUrl: './midi-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, PopoverComponent, PopoverTriggerDirective],
})
export class MidiPanelComponent {
  /** The phone's bar: the dot and the icon, no name. */
  readonly compact = input(false);

  protected readonly midi = inject(MidiService);
  private readonly _i18n = inject(TranslationService);

  /** The key of what is said while no piano is connected. */
  protected readonly problemKey = computed(() => {
    const kind = this.midi.problem()?.kind;
    return kind !== undefined && Object.hasOwn(PROBLEM_KEYS, kind) ? PROBLEM_KEYS[kind] : NOT_CONNECTED;
  });

  /** The state as one sentence, for the button's name - worded here, so it follows the language. */
  protected readonly statusText = computed(() => {
    const status = this.midi.status();
    if (status.connected) {
      return this._i18n.t('midi.connected', { name: status.name ?? '' });
    }
    const detail = this.midi.problem()?.detail;
    const sentence = this._i18n.t(this.problemKey());
    return detail ? `${sentence}: ${detail}` : sentence;
  });

  protected choose(event: Event): void {
    this.midi.selectedId.set((event.target as HTMLSelectElement).value);
  }
}
