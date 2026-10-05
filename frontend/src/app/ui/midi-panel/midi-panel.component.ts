import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, afterRenderEffect, computed, inject, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { MidiProblemKind, MidiService } from '../../core/midi/midi.service';
import { IconComponent } from '../icon/icon.component';

/** Why there is no piano, as a sentence of the app's own: the kind's key, written out whole. */
const PROBLEM_KEYS: Record<MidiProblemKind, string> = {
  unsupported: 'midi.unsupported',
  refused: 'midi.refused',
  failed: 'midi.failed',
};

/** Nothing went wrong: there is just no piano connected. */
const NOT_CONNECTED = 'midi.notConnected';

/** How near the edge of the screen the box may come, in px. */
const SCREEN_EDGE = 8;

/**
 * The piano, in the top bar - an app widget just left of the language: a
 * round-ended button with a dot (green: connected; amber: not), the piano's
 * icon and, on a wide bar, the device's name (or "No piano"). On a phone
 * (`compact`) the dot and the icon alone.
 *
 * The button opens a box under it with the whole state: the status sentence,
 * the MIDI devices the browser offers, Connect, and Rescan. It is a
 * disclosure, not a menu (it holds a list and buttons): the focus goes to the
 * device list when it opens; Escape closes it and gives the focus back to the
 * button; a click outside, or the focus leaving it, closes it. It stays on
 * the screen at 360 px - moved sideways by what it takes, as the language
 * menu is.
 *
 * MidiService says what is the case - connected and the device's name, or the
 * kind of a problem and its detail - and the words are chosen here. A device's
 * name is never translated; the detail of a problem is the browser's own
 * English (or PianoMidi's), shown after the app's sentence and marked
 * lang="en". The box stays in the page while closed (hidden), so the status
 * is there for the shell's checks in every state.
 */
@Component({
  selector: 'app-midi-panel',
  templateUrl: './midi-panel.component.html',
  styleUrl: './midi-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class MidiPanelComponent {
  /** The phone's bar: the dot and the icon, no name. */
  readonly compact = input(false);

  protected readonly midi = inject(MidiService);
  private readonly _i18n = inject(TranslationService);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);

  protected readonly open = signal(false);

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

  private readonly _button = viewChild<ElementRef<HTMLButtonElement>>('button');
  private readonly _box = viewChild<ElementRef<HTMLElement>>('box');
  private readonly _select = viewChild<ElementRef<HTMLSelectElement>>('select');

  constructor() {
    afterRenderEffect(() => {
      if (this.open()) this._keepOnScreen(this._box()?.nativeElement);
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.open.set(true);
    // Into the box once it is shown: with no zone, a microtask runs before it is.
    afterNextRender(() => this._select()?.nativeElement.focus(), { injector: this._injector });
  }

  /** Closes the box; `returnFocus`: back to the button (Escape, the button again). */
  close(returnFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this._button()?.nativeElement.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this._host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }

  /** The focus went somewhere outside the widget (Tab past the box's last button): the box closes. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this._host.nativeElement.contains(next)) {
      this.close(false);
    }
  }

  protected choose(event: Event): void {
    this.midi.selectedId.set((event.target as HTMLSelectElement).value);
  }

  /** The box stands right-aligned under the button; on a phone that can reach past the left edge - moved back by what it takes. */
  private _keepOnScreen(element: HTMLElement | undefined): void {
    if (!element) {
      return;
    }
    element.style.setProperty('--shift', '0px');
    const box = element.getBoundingClientRect();
    const screen = document.documentElement.clientWidth;
    let shift = 0;
    if (box.left < SCREEN_EDGE) {
      shift = SCREEN_EDGE - box.left;
    }
    if (box.right + shift > screen - SCREEN_EDGE) {
      shift = screen - SCREEN_EDGE - box.right;
    }
    element.style.setProperty('--shift', `${Math.round(shift)}px`);
  }
}
