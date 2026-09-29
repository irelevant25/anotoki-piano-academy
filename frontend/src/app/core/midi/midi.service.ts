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

/**
 * The piano connection the header shows and every view listens to: the
 * status, the devices, the one chosen. It remembers the last device by name,
 * connects it again when it comes back, and lets go of it when it is unplugged
 * or switched off.
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
  /** A sentence instead of "Piano not connected": no Web MIDI, or access refused. */
  readonly problem = signal<string | null>(null);

  readonly status = computed(() => {
    const name = this.connectedName();
    return name !== null
      ? { text: `Connected: ${name}`, connected: true }
      : { text: this.problem() ?? 'Piano not connected', connected: false };
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
      this.problem.set('Web MIDI not supported — use Chrome or Edge');
    }
  }

  /** The ⟳ button: ask the browser for the devices again. */
  async refresh(): Promise<void> {
    try {
      this.showDevices(await this.piano.requestAccess());
    } catch (error) {
      this.problem.set(error instanceof Error ? error.message : String(error));
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
      this.problem.set(error instanceof Error ? error.message : String(error));
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
        this.problem.set(error instanceof Error ? error.message : String(error));
      }
    }
  }
}
