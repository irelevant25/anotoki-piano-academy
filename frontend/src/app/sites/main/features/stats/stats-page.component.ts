import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { StatTileComponent, StatTilesComponent } from '@anotoki/lib/ui/stat-tiles';
import { LocalDatePipe } from '../../../../shared/i18n/local-date.pipe';
import { stepShort, unitTitle } from '../../../../shared/i18n/path-words';
import { Session, SessionMode } from '../../../../shared/music/music.types';
import { PathService } from '../../../../shared/music/path.service';
import { SongsService } from '../../../../shared/music/songs.service';
import { TheoryService } from '../../../../shared/music/theory.service';
import { BootService } from '../../../../shared/state/boot.service';
import { ProgressStore } from '../../../../shared/state/progress-store.service';
import { KeyboardModel } from '../../common/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../common/piano-keyboard/piano-keyboard.component';
import { OwnProgressComponent } from './own-progress/own-progress.component';

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

/**
 * What a session's mode is called in the Mode column: whole keys, one a mode.
 * The two that go on with a name ("Lesson: ...", "Song: ...") have it as
 * {name}. A key is never put together from anything a session holds - its
 * mode, ids and label are whatever was stored: a mode this table does not
 * have reads as the Note Trainer's, as it always did.
 */
const MODE_KEYS: Record<SessionMode, string> = {
  lesson: 'stats.mode.lesson',
  song: 'stats.mode.song',
  sheet: 'stats.mode.sheet',
  trainer: 'stats.mode.trainer',
};

/** One line of "Recent sessions". */
interface RecentRow {
  id: string;
  /** The moment it was played, as stored: the template writes it the way the page's language does. */
  when: string;
  /** The mode's words, cut where the name goes; not cut (the third is false) for a mode that has no name. */
  mode: ReturnType<TranslationService['around']>;
  /** What was played: a lesson step or a song. */
  name: string;
  /**
   * The name is text kept with the session - English, whatever language the
   * page is in - because the step or the song it was is not in the app any
   * more (or never said which it was). It is drawn marked `lang="en"`.
   */
  stored: boolean;
  score: string;
  accuracy: number | string;
  timingMs: number | null;
}

/**
 * Stats: the tiles, a keyboard heatmap of each note's mastery, the recent
 * sessions - and the learner's own progress file (OwnProgressComponent), for
 * somebody signed in: a visitor (practising without signing in) has no file
 * of their own, and is offered the sign-in in its place (ownProgress.visitor).
 * The cards, the tiles (@anotoki/lib/ui/stat-tiles, anotoki-lib 0.6.0), the
 * table (the family's table styles: a small card a round on a phone, its
 * numbers read from their names), its empty state and the buttons are the
 * family's; the keyboard and its legend Piano's.
 */
@Component({
  selector: 'app-stats-page',
  templateUrl: './stats-page.component.html',
  styleUrl: './stats-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PianoKeyboardComponent, TranslatePipe, LocalDatePipe, OwnProgressComponent, ButtonComponent, CardComponent, EmptyStateComponent, StatTileComponent, StatTilesComponent],
})
export class StatsPageComponent {
  private readonly store = inject(ProgressStore);
  private readonly theory = inject(TheoryService);
  private readonly path = inject(PathService);
  private readonly songs = inject(SongsService);
  private readonly i18n = inject(TranslationService);
  private readonly boot = inject(BootService);
  protected readonly signedIn = inject(AnotokiAuth).signedIn;

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
      /** A whole number of percent - null before the first answer. */
      accuracy: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : null,
      streak: computeStreak(sessions),
      sessions: sessions.length,
      minutes: practiceMinutes(sessions),
    };
  });

  /**
   * The latest fifteen, newest first. Everything here is text - Angular escapes it.
   *
   * Worded here, inside the computed(), so the rows follow the language. A
   * lesson's row is worded only when its step is still on the path, and then
   * from that step's own ids; a song's from the song the app has under that
   * id. Anything else shows what was stored with the session, as it is.
   */
  protected readonly recent = computed<RecentRow[]>(() =>
    [...this.store.sessions()]
      .reverse()
      .slice(0, 15)
      .map((session) => {
        const named = this.named(session);
        return {
          id: session.id,
          when: session.startedAt || session.recordedAt,
          mode: this.i18n.around(Object.hasOwn(MODE_KEYS, session.mode) ? MODE_KEYS[session.mode] : MODE_KEYS.trainer, 'name'),
          name: named.name,
          stored: named.stored,
          score: `${session.correct ?? ''}/${session.attempts ?? ''}`,
          accuracy: session.accuracy ?? '',
          timingMs: session.avgTimingErrorMs ?? null,
        };
      }),
  );

  constructor() {
    effect(() => {
      const progress = this.store.progress();
      for (const midi of this.theory.curriculum) {
        this.keyboard.setKeyLevel(midi, progress[midi]?.status ?? 'new');
      }
    });
  }

  /** What a lesson's or a song's session was of: found in the app by its ids, or else as stored. */
  /** To the IAM and back (a visitor's progress comes along: BootService moves it). */
  protected signIn(): void {
    void this.boot.signIn();
  }

  private named(session: Session): { name: string; stored: boolean } {
    if (session.mode === 'lesson') {
      const found = this.path.findStep(session.unitId, session.stepId);
      return found
        ? { name: this.i18n.t('stats.lessonLabel', { unit: unitTitle(this.i18n, found.unit), step: stepShort(this.i18n, found.step.type) }), stored: false }
        : { name: session.label ?? '', stored: true };
    }
    if (session.mode === 'song') {
      const song = this.songs.byId(session.songId);
      return song ? { name: song.title, stored: false } : { name: session.songTitle ?? '', stored: true };
    }
    return { name: '', stored: false };
  }
}
