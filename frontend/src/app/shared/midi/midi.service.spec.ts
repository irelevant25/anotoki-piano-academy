import { TestBed } from '@angular/core/testing';
import { MidiService } from './midi.service';

/** A MIDI input as the browser hands it over, as far as the service reads it. */
function input(id: string, name: string): MIDIInput {
  return { id, name, manufacturer: 'KAWAI', state: 'connected', onmidimessage: null } as unknown as MIDIInput;
}

/** The browser's answer to requestMIDIAccess(): its inputs by id. */
function access(inputs: MIDIInput[]): MIDIAccess {
  return { inputs: new Map(inputs.map((entry) => [entry.id, entry])), onstatechange: null } as unknown as MIDIAccess;
}

/** A browser that has Web MIDI, answering `answer()` when asked for the devices. */
function browserWithMidi(answer: () => Promise<MIDIAccess>): void {
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: answer });
}

describe('MidiService: what the header is told - a state, never a sentence', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess;
    localStorage.clear();
  });

  it('says "not connected" as a state: no name, no problem', () => {
    const midi = TestBed.inject(MidiService);
    expect(midi.status()).toEqual({ connected: false, name: null });
    expect(midi.problem()).toBeNull();
  });

  it('a browser with no Web MIDI is a kind with nothing more to say - at the start, and when asked again', async () => {
    const midi = TestBed.inject(MidiService);
    expect(midi.supported).toBe(false);

    midi.start();
    expect(midi.problem()).toEqual({ kind: 'unsupported', detail: null });
    expect(midi.status()).toEqual({ connected: false, name: null });

    midi.problem.set(null);
    await midi.refresh();
    expect(midi.problem()).toEqual({ kind: 'unsupported', detail: null });
    expect(midi.asked()).toBe(true);
  });

  it('a browser that will not give the devices is "refused", with its own words as the detail', async () => {
    browserWithMidi(() => Promise.reject(new Error('Permission to use Web MIDI API was not granted.')));
    const midi = TestBed.inject(MidiService);
    expect(midi.supported).toBe(true);

    await midi.refresh();
    expect(midi.problem()).toEqual({ kind: 'refused', detail: 'Permission to use Web MIDI API was not granted.' });
    expect(midi.status()).toEqual({ connected: false, name: null });
    expect(midi.asked()).toBe(true);
  });

  it('a refusal that says nothing has no detail', async () => {
    browserWithMidi(() => Promise.reject(new Error('  ')));
    const midi = TestBed.inject(MidiService);
    await midi.refresh();
    expect(midi.problem()).toEqual({ kind: 'refused', detail: null });
  });

  it('a connected piano is its name, as the browser gives it - and whatever was wrong before is over', async () => {
    browserWithMidi(() => Promise.resolve(access([input('in-1', 'KAWAI ES120')])));
    const midi = TestBed.inject(MidiService);
    await midi.refresh();
    expect(midi.devices().map((device) => device.name)).toEqual(['KAWAI ES120']);
    expect(midi.selectedId()).toBe('in-1');
    expect(midi.status()).toEqual({ connected: false, name: null });
    expect(midi.problem()).toBeNull();

    midi.problem.set({ kind: 'failed', detail: 'MIDI input in-0 not found.' });
    midi.connect();
    expect(midi.status()).toEqual({ connected: true, name: 'KAWAI ES120' });
    expect(midi.problem()).toBeNull();

    midi.piano.disconnect();
    expect(midi.status()).toEqual({ connected: false, name: null });
    expect(midi.problem()).toBeNull();
  });

  it('a device that cannot be connected is "failed", with PianoMidi’s own words as the detail', async () => {
    browserWithMidi(() => Promise.resolve(access([input('in-1', 'KAWAI ES120')])));
    const midi = TestBed.inject(MidiService);
    await midi.refresh();

    midi.selectedId.set('in-9');
    midi.connect();
    expect(midi.problem()).toEqual({ kind: 'failed', detail: 'MIDI input in-9 not found.' });
    expect(midi.status()).toEqual({ connected: false, name: null });
  });
});
