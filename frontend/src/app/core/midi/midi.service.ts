import { Injectable, computed, signal } from '@angular/core';
import { readStorage, writeStorage } from '../util/storage';

// The only part of the app that talks to the piano: the browser's Web MIDI
// API. Plug a KAWAI ES120 (or any class-compliant USB-MIDI keyboard) into the
// computer and Chrome or Edge offers it here directly - no driver, no server.

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export interface NoteOnDetail {
  midi: number;
  velocity: number;
  /** performance.now() when the key went down - what tempo grading compares with the clicks. */
  timestamp: number;
}

const LAST_DEVICE_KEY = 'piano-learning:last-midi-device-name';

/**
 * A thin wrapper around Web MIDI: an EventTarget emitting 'noteon' / 'noteoff'
 * (performance.now()-stamped) and 'connected' / 'disconnected' /
 * 'devicechange'. The practice views listen to it exactly as they would to
 * the keyboard; the tests dispatch 'noteon' on it themselves (window.pianoMIDI).
 */
export class PianoMidi extends EventTarget {
  access: MIDIAccess | null = null;
  input: MIDIInput | null = null;

  get isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async requestAccess(): Promise<MidiDevice[]> {
    if (!this.isSupported) throw new Error('Web MIDI API is not supported in this browser. Use Chrome or Edge.');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.dispatchEvent(new CustomEvent('devicechange', { detail: this.listInputs() }));
    return this.listInputs();
  }

  listInputs(): MidiDevice[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()]
      .filter((input) => input.state !== 'disconnected')
      .map((input) => ({ id: input.id, name: input.name ?? '', manufacturer: input.manufacturer ?? '', state: input.state }));
  }

  connect(inputId: string): void {
    if (!this.access) throw new Error('Call requestAccess() first.');
    if (this.input) this.input.onmidimessage = null;

    const input = this.access.inputs.get(inputId);
    if (!input) throw new Error(`MIDI input ${inputId} not found.`);

    this.input = input;
    this.input.onmidimessage = (event) => this.handleMessage(event);
    this.dispatchEvent(new CustomEvent('connected', { detail: { id: input.id, name: input.name ?? input.id } }));
  }

  disconnect(): void {
    if (!this.input) return;
    this.input.onmidimessage = null;
    this.input = null;
    this.dispatchEvent(new CustomEvent('disconnected'));
  }

  private handleMessage(event: MIDIMessageEvent): void {
    if (!event.data) return;
    const [statusByte, note, velocity] = event.data;
    const command = statusByte & 0xf0;
    const timestamp = performance.now();

    if (command === 0x90 && velocity > 0) {
      this.dispatchEvent(new CustomEvent<NoteOnDetail>('noteon', { detail: { midi: note, velocity, timestamp } }));
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.dispatchEvent(new CustomEvent('noteoff', { detail: { midi: note, timestamp } }));
    }
    // The sustain pedal (CC 64) and other controllers are left alone for now.
  }
}

/** Whether a piano is connected, and the device's own name when one is. */
export interface MidiStatus {
  connected: boolean;
  /** The device's name as the browser gives it: a name, shown as it is. Null while nothing is connected. */
  name: string | null;
}

/**
 * Why there is no piano, as a kind the header words:
 *   unsupported  this browser has no Web MIDI
 *   refused      the browser would not give the devices (the permission was denied, or it failed)
 *   failed       a device could not be connected
 */
export type MidiProblemKind = 'unsupported' | 'refused' | 'failed';

export interface MidiProblem {
  kind: MidiProblemKind;
  /**
   * The browser's own words, or PianoMidi's: English, whatever the page is
   * in. Shown after the app's own sentence, marked lang="en". Null when there
   * is nothing more to say than the kind.
   */
  detail: string | null;
}

/** What an error says for itself - or null when it says nothing. */
function detailOf(error: unknown): string | null {
  const text = (error instanceof Error ? error.message : String(error)).trim();
  return text === '' ? null : text;
}

/**
 * The piano connection the header shows and every view listens to: the
 * status, the devices, the one chosen. It remembers the last device by name,
 * connects it again when it comes back, and lets go of it when it is unplugged
 * or switched off.
 *
 * It holds no sentence: the status is whether a piano is connected and its
 * name, a problem is a kind and a detail, and the header's panel words them in
 * the language on the page.
 */
@Injectable({ providedIn: 'root' })
export class MidiService {
  readonly piano = new PianoMidi();
  readonly supported = this.piano.isSupported;

  readonly devices = signal<MidiDevice[]>([]);
  readonly selectedId = signal('');
  readonly connectedName = signal<string | null>(null);
  /** The browser has been asked for the devices (so an empty list means there are none). */
  readonly asked = signal(false);
  /** Why there is no piano, when there is more to say than "not connected": no Web MIDI, access refused, a device that would not connect. */
  readonly problem = signal<MidiProblem | null>(null);

  readonly status = computed<MidiStatus>(() => {
    const name = this.connectedName();
    return { connected: name !== null, name };
  });

  constructor() {
    // For the devtools console and the browser tests (see the project skill).
    (globalThis as { pianoMIDI?: PianoMidi }).pianoMIDI = this.piano;

    this.piano.addEventListener('connected', (event) => {
      const { name } = (event as CustomEvent<{ id: string; name: string }>).detail;
      this.problem.set(null);
      this.connectedName.set(name);
      writeStorage(LAST_DEVICE_KEY, name);
    });
    this.piano.addEventListener('disconnected', () => {
      this.problem.set(null);
      this.connectedName.set(null);
    });
    this.piano.addEventListener('devicechange', (event) => this.showDevices((event as CustomEvent<MidiDevice[]>).detail));
  }

  /** Once the app runs: ask for the piano, or say why there is none. */
  start(): void {
    if (this.supported) {
      void this.refresh();
    } else {
      this.problem.set({ kind: 'unsupported', detail: null });
    }
  }

  /** The ⟳ button: ask the browser for the devices again. */
  async refresh(): Promise<void> {
    // No Web MIDI here: that is the whole answer, and the header has its own sentence for it.
    if (!this.supported) {
      this.problem.set({ kind: 'unsupported', detail: null });
      this.asked.set(true);
      return;
    }
    try {
      this.showDevices(await this.piano.requestAccess());
    } catch (error) {
      this.problem.set({ kind: 'refused', detail: detailOf(error) });
    } finally {
      this.asked.set(true);
    }
  }

  connect(): void {
    const id = this.selectedId();
    if (!id) return;
    try {
      this.piano.connect(id);
    } catch (error) {
      this.problem.set({ kind: 'failed', detail: detailOf(error) });
    }
  }

  private showDevices(devices: MidiDevice[]): void {
    // The piano was unplugged or switched off: stop showing it as connected.
    if (this.piano.input && !devices.some((device) => device.id === this.piano.input?.id)) this.piano.disconnect();

    this.devices.set(devices);
    if (devices.length === 0) {
      this.selectedId.set('');
      return;
    }

    const lastName = readStorage(LAST_DEVICE_KEY);
    const match = lastName ? devices.find((device) => device.name === lastName) : undefined;
    const current = this.piano.input ? devices.find((device) => device.id === this.piano.input?.id) : undefined;
    this.selectedId.set(current?.id ?? match?.id ?? devices[0].id);
    if (!this.piano.input && match) {
      try {
        this.piano.connect(match.id);
      } catch (error) {
        this.problem.set({ kind: 'failed', detail: detailOf(error) });
      }
    }
  }
}
