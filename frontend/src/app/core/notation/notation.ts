import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import { TheoryService } from '../music/theory.service';

// A thin wrapper around VexFlow (5.0.0, from npm) for drawing staff notation:
// one note as a flashcard, or a sequence of quarter notes as measures.
// Sequences are treble clef only for now - the left hand's notes need the
// bass clef, which is the first thing the left-hand phase adds.
//
// 'vexflow/bravura' is VexFlow with the two fonts this app draws with (Bravura
// for the music, Academico for text) and none of the others.

/**
 * Resolves once VexFlow's fonts can draw. VexFlow adds them to document.fonts
 * when it is imported and they load a moment later; notation drawn before
 * that would be measured and drawn with the wrong glyphs. The pages that show
 * notation wait for this before they open (app.routes.ts).
 */
export async function notationFontsReady(): Promise<void> {
  const fonts = (globalThis.document as Document | undefined)?.fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  try {
    await Promise.all([fonts.load('30px Bravura'), fonts.load('12px Academico')]);
  } catch {
    // Drawn with whatever the browser has; still readable.
  }
}

export interface SequenceNote {
  midi: number;
}

export class Notation {
  private readonly renderer: Renderer;

  constructor(
    private readonly container: HTMLDivElement,
    private readonly theory: TheoryService,
  ) {
    // Renderer.Backends (plural) - VexFlow 5's name; the singular is undefined.
    // The renderer puts its <svg> into the container once, here: every redraw
    // clears it with context.clear(), never by emptying the container, which
    // would detach that same <svg> and leave the staff silently blank.
    this.renderer = new Renderer(container, Renderer.Backends.SVG);
  }

  private buildNote(midi: number, clef: string): StaveNote {
    const key = this.theory.midiToVexKey(midi);
    const note = new StaveNote({ keys: [key], duration: 'q', clef });
    if (key.includes('#')) note.addModifier(new Accidental('#'));
    return note;
  }

  /** Each drawn note's SVG group carries its pitch, so the browser tests can read the staff. */
  private tagMidi(notes: StaveNote[], midis: number[]): void {
    notes.forEach((note, i) => note.getSVGElement()?.setAttribute('data-midi', String(midis[i])));
  }

  /** A single note, flashcard-style, on the clef it belongs to. */
  renderSingleNote(midi: number): StaveNote {
    const width = 220;
    const height = 150;
    this.renderer.resize(width, height);
    const context = this.renderer.getContext();
    context.clear();
    const clef = this.theory.clefForMidi(midi);

    const stave = new Stave(10, 10, width - 20);
    stave.addClef(clef);
    stave.setContext(context).draw();

    const note = this.buildNote(midi, clef);
    const voice = new Voice({ numBeats: 1, beatValue: 4 }).setMode(Voice.Mode.SOFT);
    voice.addTickables([note]);
    new Formatter().joinVoices([voice]).format([voice], width - 80);
    voice.draw(context, stave);
    this.tagMidi([note], [midi]);

    return note;
  }

  /**
   * A sequence of quarter notes as treble-clef measures. One VexFlow note per
   * entry, in order - note.getSVGElement() is what the player highlights.
   */
  renderSequence(sequence: SequenceNote[], { beatsPerMeasure = 4, timeSignature = '4/4' } = {}): StaveNote[] {
    const measures: SequenceNote[][] = [];
    for (let i = 0; i < sequence.length; i += beatsPerMeasure) {
      measures.push(sequence.slice(i, i + beatsPerMeasure));
    }

    // The first measure also holds the clef and the time signature: it gets
    // their room on top, so its notes are spaced like every other measure's.
    const measureWidth = 160;
    const firstExtra = 50;
    const width = measures.length * measureWidth + firstExtra + 40;
    const height = 150;
    this.renderer.resize(width, height);
    const context = this.renderer.getContext();
    context.clear();

    let x = 10;
    const allNotes: StaveNote[] = [];

    measures.forEach((measureNotes, i) => {
      const stave = new Stave(x, 20, measureWidth + (i === 0 ? firstExtra : 0));
      if (i === 0) stave.addClef('treble').addTimeSignature(timeSignature);
      stave.setContext(context).draw();

      const staveNotes = measureNotes.map(({ midi }) => this.buildNote(midi, 'treble'));
      const voice = new Voice({ numBeats: measureNotes.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
      voice.addTickables(staveNotes);
      // Spread over the room this stave has left for notes - not a fixed width,
      // which ran the first measure's notes over its barline.
      new Formatter().joinVoices([voice]).formatToStave([voice], stave);
      voice.draw(context, stave);
      this.tagMidi(
        staveNotes,
        measureNotes.map((note) => note.midi),
      );

      allNotes.push(...staveNotes);
      x += stave.getWidth();
    });

    return allNotes;
  }
}
