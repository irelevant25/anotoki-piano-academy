import { TestBed } from '@angular/core/testing';
import { SongsService } from './songs.service';

describe('SongsService', () => {
  let songs: SongsService;

  beforeEach(() => {
    songs = TestBed.inject(SongsService);
  });

  it('keeps the song ids sessions and the path refer to', () => {
    expect(songs.songs.map((song) => song.id)).toEqual(['hot-cross-buns', 'mary-had-a-little-lamb', 'ode-to-joy', 'twinkle-twinkle', 'joy-to-the-world']);
  });

  it('writes songs as quarter notes, beat after beat', () => {
    const buns = songs.byId('hot-cross-buns')!;
    expect(buns.notes.slice(0, 3)).toEqual([
      { midi: 64, beat: 0, durationBeats: 1 },
      { midi: 62, beat: 1, durationBeats: 1 },
      { midi: 60, beat: 2, durationBeats: 1 },
    ]);
    expect(songs.byId('nope')).toBeNull();
  });

  it('unlocks a song once every note it uses is known', () => {
    const mary = songs.byId('mary-had-a-little-lamb')!;
    expect(songs.requiredNotes(mary).sort()).toEqual([60, 62, 64, 67]);
    expect(songs.isSongUnlocked(mary, (midi) => [60, 62, 64].includes(midi))).toBe(false);
    expect(songs.isSongUnlocked(mary, (midi) => [60, 62, 64, 67].includes(midi))).toBe(true);
  });
});
