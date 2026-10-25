import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { SelectComponent, SelectOption } from '@anotoki/lib/ui/select';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { MidiService } from '../../../../shared/midi/midi.service';
import { SongsService } from '../../../../shared/music/songs.service';
import { SrsService } from '../../../../shared/music/srs.service';
import { TheoryService } from '../../../../shared/music/theory.service';
import { SequencePlayer, sessionFieldsFromResult } from '../../common/player/sequence-player';
import { ProgressStore } from '../../../../shared/state/progress-store.service';
import { NotationComponent } from '../../common/notation/notation.component';
import { KeyboardModel } from '../../common/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../common/piano-keyboard/piano-keyboard.component';
import { Feedback } from '../lesson/step-outcome';

/** A tempo on offer: the number, and whether it is the song's own - worded as the select's choice (tempoOptions). */
interface TempoOption {
  value: number;
  original: boolean;
}

/**
 * One song (/songs/:songId), played along with the metronome at its own
 * tempo, a little slower or faster. The card, the tempo (the family's
 * select) and the buttons are the family's; the practice screen is Piano's
 * own.
 */
@Component({
  selector: 'app-song-player-page',
  templateUrl: './song-player-page.component.html',
  styleUrl: './song-player-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotationComponent, PianoKeyboardComponent, TranslatePipe, ButtonComponent, CardComponent, SelectComponent, IconComponent],
})
export class SongPlayerPageComponent implements OnInit {
  private readonly midi = inject(MidiService);
  private readonly theory = inject(TheoryService);
  private readonly srs = inject(SrsService);
  private readonly library = inject(SongsService);
  private readonly store = inject(ProgressStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);

  /** From the address (withComponentInputBinding). */
  readonly songId = input<string>();

  /** The song's title is its name: shown as SongsService has it, in every language. */
  protected readonly song = computed(() => this.library.byId(this.songId()));
  /**
   * Opened by its address, a locked song stays locked. Decided once, when the
   * song opens: a miss while playing can send a note back to "learning", and
   * the song must not lock itself in the middle of being played.
   */
  protected readonly unlocked = signal(false);
  protected readonly tempos = computed<TempoOption[]>(() => {
    const song = this.song();
    return song ? [0.75, 1, 1.25].map((factor) => ({ value: Math.round(song.bpm * factor), original: factor === 1 })) : [];
  });
  /** The tempos as the select's choices, in the page's language ("100 BPM (original)"). */
  protected readonly tempoOptions = computed<SelectOption<number>[]>(() =>
    this.tempos().map((tempo) => ({ value: tempo.value, label: this.i18n.t(tempo.original ? 'tempo.bpmOriginal' : 'tempo.bpm', { bpm: tempo.value }) })),
  );

  private readonly staff = viewChild(NotationComponent);
  protected readonly keyboard = new KeyboardModel();
  protected readonly bpm = signal(0);
  protected readonly playing = signal(false);
  /** A key and its values, never a sentence: the template words it. */
  protected readonly feedback = signal<Feedback>({ key: 'songs.ready', kind: null });

  private player: SequencePlayer | null = null;

  constructor() {
    this.keyboard.markKnown(this.store.knownNotes());
    afterNextRender(() => this.begin());
    inject(DestroyRef).onDestroy(() => this.player?.destroy());
  }

  ngOnInit(): void {
    const song = this.song();
    const progress = this.store.progress();
    this.unlocked.set(!!song && this.library.isSongUnlocked(song, (midi) => this.srs.isUnlocked(progress[midi])));
  }

  private begin(): void {
    const song = this.song();
    const staff = this.staff();
    if (!song || !staff || !this.unlocked()) return;
    this.bpm.set(song.bpm);
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
        // The title stored with the session is the song's own English name, as ever (Stats words a row from the song's id).
        this.store.recordSession({ mode: 'song', songId: song.id, songTitle: song.title, ...sessionFieldsFromResult(result) }).catch((error) => console.error('Failed to record session', error));
      },
    });
    this.player.load(song.notes, { timeSignature: song.timeSignature });
  }

  protected chooseTempo(value: number): void {
    this.bpm.set(value);
  }

  protected start(): void {
    this.playing.set(true);
    this.player?.start({ mode: 'tempo', bpm: this.bpm() });
  }

  protected back(): void {
    void this.router.navigateByUrl('/songs');
  }
}
