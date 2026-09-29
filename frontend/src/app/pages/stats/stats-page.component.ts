import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Session } from '../../core/music/music.types';
import { TheoryService } from '../../core/music/theory.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { KeyboardModel } from '../../ui/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../ui/piano-keyboard/piano-keyboard.component';

/** A calendar day in the learner's own time zone (the times are stored in UTC). */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Days in a row with practice, counted in local days. A day without practice
 * yet does not break the streak until it is over: the count starts from
 * yesterday then.
 */
export function computeStreak(sessions: Session[], now: Date = new Date()): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => localDayKey(new Date(s.startedAt || s.recordedAt))));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Minutes of practice, from each session's start and end (odd gaps over an hour left out). */
export function practiceMinutes(sessions: Session[]): number {
  let ms = 0;
  for (const session of sessions) {
    if (session.startedAt && session.endedAt) {
      const length = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
      if (length > 0 && length < 3_600_000) ms += length;
    }
  }
  return Math.round(ms / 60000);
}

/** Stats: the tiles, a keyboard heatmap of each note's mastery, and the recent sessions. */
@Component({
  selector: 'app-stats-page',
  templateUrl: './stats-page.component.html',
  styleUrl: './stats-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PianoKeyboardComponent],
})
export class StatsPageComponent {
  private readonly store = inject(ProgressStore);
  private readonly theory = inject(TheoryService);

  protected readonly keyboard = new KeyboardModel();
  protected readonly curriculumLength = this.theory.curriculum.length;

  protected readonly tiles = computed(() => {
    const progress = this.store.progress();
    const sessions = this.store.sessions();
    const attempted = this.theory.curriculum.map((midi) => progress[midi]).filter((state) => state && state.totalAttempts > 0);
    const totalAttempts = attempted.reduce((sum, state) => sum + state.totalAttempts, 0);
    const totalCorrect = attempted.reduce((sum, state) => sum + state.correctAttempts, 0);
    return {
      known: this.store.knownNotes().length,
      mastered: this.theory.curriculum.filter((midi) => progress[midi]?.status === 'mastered').length,
      accuracy: totalAttempts ? `${Math.round((totalCorrect / totalAttempts) * 100)}%` : '—',
      streak: computeStreak(sessions),
      sessions: sessions.length,
      minutes: practiceMinutes(sessions),
    };
  });

  /** The latest fifteen, newest first. Everything here is text - Angular escapes it. */
  protected readonly recent = computed(() =>
    [...this.store.sessions()].reverse().slice(0, 15).map((session) => ({
      id: session.id,
      when: new Date(session.startedAt || session.recordedAt).toLocaleString(),
      mode: session.mode === 'lesson' ? `Lesson: ${session.label ?? ''}`
        : session.mode === 'song' ? `Song: ${session.songTitle ?? ''}`
          : session.mode === 'sheet' ? 'Sheet Practice' : 'Note Trainer',
      score: `${session.correct ?? ''}/${session.attempts ?? ''}`,
      accuracy: `${session.accuracy ?? ''}%`,
      timing: session.avgTimingErrorMs != null ? `${session.avgTimingErrorMs}ms` : '—',
    })),
  );

  constructor() {
    effect(() => {
      const progress = this.store.progress();
      for (const midi of this.theory.curriculum) {
        this.keyboard.setKeyLevel(midi, progress[midi]?.status ?? 'new');
      }
    });
  }
}
