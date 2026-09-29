import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SongsService } from '../../core/music/songs.service';
import { SrsService } from '../../core/music/srs.service';
import { TheoryService } from '../../core/music/theory.service';
import { ProgressStore } from '../../core/state/progress-store.service';

/** Songs: every song, each unlocked once every note it uses is known. */
@Component({
  selector: 'app-songs-page',
  templateUrl: './songs-page.component.html',
  styleUrl: './songs-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongsPageComponent {
  private readonly router = inject(Router);
  private readonly store = inject(ProgressStore);
  private readonly srs = inject(SrsService);
  private readonly theory = inject(TheoryService);
  private readonly library = inject(SongsService);

  protected readonly songs = computed(() => {
    const progress = this.store.progress();
    const isKnown = (midi: number): boolean => this.srs.isUnlocked(progress[midi]);
    return this.library.songs.map((song) => ({
      song,
      unlocked: this.library.isSongUnlocked(song, isKnown),
      needs: this.library.requiredNotes(song).map((midi) => this.theory.midiToName(midi)).join(', '),
    }));
  });

  protected play(songId: string): void {
    void this.router.navigate(['/songs', songId]);
  }
}
