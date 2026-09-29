import { Injectable } from '@angular/core';

// Music theory the whole app shares: note names and MIDI numbers, the white
// keys, which clef a note belongs on, and the curriculum - the order notes are
// introduced in. Pure: no state, no side effects.

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const LETTER_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

@Injectable({ providedIn: 'root' })
export class TheoryService {
  /** Middle C. */
  readonly middleC = 60;

  /** An 88-key piano runs A0..C8. */
  readonly pianoLowestMidi = 21;
  readonly pianoHighestMidi = 108;

  /**
   * The order notes are introduced in: two diatonic (white-key) octaves around
   * Middle C - the whole right hand first, then the left hand. The learning
   * path's units introduce exactly these, in this order (PathService); keep the
   * two in step. Sharps and flats, and notes outside C3-C5, are a deliberate
   * extension point for later.
   */
  readonly curriculum: readonly number[] = [
    60, 62, 64, 67, 65, 69, // C4 D4 E4 G4 F4 A4 - right hand, in the order the path's songs need them
    71, 72, // B4 C5 - the right hand upwards
    48, 50, 52, 53, 55, // C3 D3 E3 F3 G3 - left hand, five-finger position
    57, 59, // A3 B3 - the gap below Middle C
  ];

  /** 60 -> "C4". */
  midiToName(midi: number): string {
    return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  }

  /** 60 -> "c/4", 61 -> "c#/4": VexFlow's key string. */
  midiToVexKey(midi: number): string {
    return `${SHARP_NAMES[((midi % 12) + 12) % 12].toLowerCase()}/${Math.floor(midi / 12) - 1}`;
  }

  /** "C4" -> 60, "F#3" -> 54, "Bb3" -> 58. */
  nameToMidi(name: string): number {
    const match = /^([A-Ga-g])(#|b)?(-?\d+)$/.exec(name.trim());
    if (!match) throw new Error(`Invalid note name: ${name}`);
    const [, letter, accidental, octave] = match;
    let semitone = LETTER_SEMITONES[letter.toUpperCase()];
    if (accidental === '#') semitone += 1;
    if (accidental === 'b') semitone -= 1;
    return (parseInt(octave, 10) + 1) * 12 + semitone;
  }

  isWhiteKey(midi: number): boolean {
    return WHITE_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
  }

  /** Below Middle C on the bass clef, from it upwards on the treble. */
  clefForMidi(midi: number): 'bass' | 'treble' {
    return midi < this.middleC ? 'bass' : 'treble';
  }
}
