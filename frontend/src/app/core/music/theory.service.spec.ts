import { TestBed } from '@angular/core/testing';
import { TheoryService } from './theory.service';

describe('TheoryService', () => {
  let theory: TheoryService;

  beforeEach(() => {
    theory = TestBed.inject(TheoryService);
  });

  it('names MIDI notes, sharps and all', () => {
    expect(theory.midiToName(60)).toBe('C4');
    expect(theory.midiToName(61)).toBe('C#4');
    expect(theory.midiToName(21)).toBe('A0');
    expect(theory.midiToName(108)).toBe('C8');
  });

  it('turns names back into MIDI numbers, flats included', () => {
    expect(theory.nameToMidi('C4')).toBe(60);
    expect(theory.nameToMidi('F#3')).toBe(54);
    expect(theory.nameToMidi('Bb3')).toBe(58);
    expect(theory.nameToMidi(' e4 ')).toBe(64);
    expect(() => theory.nameToMidi('H2')).toThrow();
  });

  it('gives VexFlow its key strings', () => {
    expect(theory.midiToVexKey(60)).toBe('c/4');
    expect(theory.midiToVexKey(61)).toBe('c#/4');
  });

  it('knows the white keys and the clefs', () => {
    expect([60, 62, 64, 65, 67, 69, 71].every((m) => theory.isWhiteKey(m))).toBe(true);
    expect([61, 63, 66, 68, 70].some((m) => theory.isWhiteKey(m))).toBe(false);
    expect(theory.clefForMidi(59)).toBe('bass');
    expect(theory.clefForMidi(60)).toBe('treble');
  });

  it('teaches fifteen white keys, the right hand first', () => {
    expect(theory.curriculum.length).toBe(15);
    expect(new Set(theory.curriculum).size).toBe(15);
    expect(theory.curriculum.slice(0, 8).every((m) => m >= 60)).toBe(true);
    expect(theory.curriculum.every((m) => theory.isWhiteKey(m))).toBe(true);
  });
});
