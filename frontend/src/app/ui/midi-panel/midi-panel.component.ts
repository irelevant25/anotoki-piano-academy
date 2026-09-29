import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MidiService } from '../../core/midi/midi.service';

/**
 * The piano, in the header: whether it is connected, the MIDI devices the
 * browser offers, Connect, and ⟳ to look for devices again.
 */
@Component({
  selector: 'app-midi-panel',
  templateUrl: './midi-panel.component.html',
  styleUrl: './midi-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MidiPanelComponent {
  protected readonly midi = inject(MidiService);

  protected choose(event: Event): void {
    this.midi.selectedId.set((event.target as HTMLSelectElement).value);
  }
}
