import { signal } from '@angular/core';

/** How one key is lit while practising. */
export type KeyState = 'target' | 'pressed' | 'correct' | 'incorrect';

/** A key's mastery, for the heatmap on Stats. */
export type KeyLevel = 'new' | 'learning' | 'review' | 'mastered';

/**
 * What the on-screen keyboard shows, kept apart from drawing it: the views
 * and the sequence player light keys through this (setKeyState, markKnown...)
 * the way they always did, and <app-piano-keyboard> draws whatever it holds.
 */
export class KeyboardModel {
  readonly states = signal<ReadonlyMap<number, KeyState>>(new Map());
  readonly known = signal<ReadonlySet<number>>(new Set());
  readonly levels = signal<ReadonlyMap<number, KeyLevel>>(new Map());

  setKeyState(midi: number, state: KeyState | null): void {
    this.states.update((states) => {
      const next = new Map(states);
      if (state) next.set(midi, state);
      else next.delete(midi);
      return next;
    });
  }

  clearStates(): void {
    this.states.set(new Map());
  }

  /** The notes the learner knows are shaded, so the right key is easier to find. */
  markKnown(midis: Iterable<number>): void {
    this.known.set(new Set(midis));
  }

  setKeyLevel(midi: number, level: KeyLevel | null): void {
    this.levels.update((levels) => {
      const next = new Map(levels);
      if (level) next.set(midi, level);
      else next.delete(midi);
      return next;
    });
  }
}
