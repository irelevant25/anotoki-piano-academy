import { Injectable, inject } from '@angular/core';
import { Song, SongNote } from './music.types';
import { TheoryService } from './theory.service';

// The song library. Every song uses only notes of the curriculum's first
// octaves, so the earliest notes already unlock something musical; each is
// the song of one learning-path unit (PathService), and uses only that
// unit's notes and the ones before it.

@Injectable({ providedIn: 'root' })
export class SongsService {
  private readonly theory = inject(TheoryService);

  /** Quarter notes, one after another - until rhythm arrives in the notation. */
  private seq(names: string[], durationBeats = 1): SongNote[] {
    let beat = 0;
    return names.map((name) => {
      const note = { midi: this.theory.nameToMidi(name), beat, durationBeats };
      beat += durationBeats;
      return note;
    });
  }

  /** Song ids are saved in sessions and named by the path: never rename one. */
  readonly songs: readonly Song[] = [
    {
      id: 'hot-cross-buns',
      title: 'Hot Cross Buns',
      bpm: 90,
      timeSignature: '4/4',
      notes: this.seq(['E4', 'D4', 'C4', 'E4', 'D4', 'C4', 'C4', 'C4', 'C4', 'C4', 'D4', 'D4', 'D4', 'D4', 'E4', 'D4', 'C4']),
    },
    {
      id: 'mary-had-a-little-lamb',
      title: 'Mary Had a Little Lamb',
      bpm: 100,
      timeSignature: '4/4',
      notes: this.seq(['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'D4', 'D4', 'D4', 'E4', 'G4', 'G4']),
    },
    {
      id: 'ode-to-joy',
      title: 'Ode to Joy (opening phrase)',
      bpm: 100,
      timeSignature: '4/4',
      notes: this.seq(['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4']),
    },
    {
      id: 'twinkle-twinkle',
      title: 'Twinkle Twinkle Little Star (opening)',
      bpm: 100,
      timeSignature: '4/4',
      notes: this.seq(['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4']),
    },
    {
      id: 'joy-to-the-world',
      title: 'Joy to the World (opening, simplified rhythm)',
      bpm: 90,
      timeSignature: '4/4',
      notes: this.seq(['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'G4', 'A4', 'A4', 'B4', 'B4', 'C5']),
    },
  ];

  byId(id: string | null | undefined): Song | null {
    return this.songs.find((song) => song.id === id) ?? null;
  }

  /** The different notes a song uses: it unlocks once each is known. */
  requiredNotes(song: Song): number[] {
    return [...new Set(song.notes.map((note) => note.midi))];
  }

  isSongUnlocked(song: Song, isKnown: (midi: number) => boolean): boolean {
    return this.requiredNotes(song).every(isKnown);
  }
}
