// Thin wrapper around the browser's Web MIDI API. This is the only piece of
// the app that talks to the KAWAI ES120 (or any class-compliant USB-MIDI
// keyboard) - plug it into the PC via USB and Chrome/Edge exposes it here
// directly, no backend involved.

export class PianoMIDI extends EventTarget {
  constructor() {
    super();
    /** @type {MIDIAccess|null} */
    this.access = null;
    /** @type {MIDIInput|null} */
    this.input = null;
  }

  get isSupported() {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async requestAccess() {
    if (!this.isSupported) throw new Error('Web MIDI API is not supported in this browser. Use Chrome or Edge.');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.dispatchEvent(new CustomEvent('devicechange', { detail: this.listInputs() }));
    return this.listInputs();
  }

  listInputs() {
    if (!this.access) return [];
    return [...this.access.inputs.values()].filter((input) => input.state !== 'disconnected').map((input) => ({
      id: input.id,
      name: input.name,
      manufacturer: input.manufacturer,
      state: input.state,
    }));
  }

  connect(inputId) {
    if (!this.access) throw new Error('Call requestAccess() first.');
    if (this.input) this.input.onmidimessage = null;

    const input = this.access.inputs.get(inputId);
    if (!input) throw new Error(`MIDI input ${inputId} not found.`);

    this.input = input;
    this.input.onmidimessage = (event) => this._handleMessage(event);
    this.dispatchEvent(new CustomEvent('connected', { detail: { id: input.id, name: input.name } }));
  }

  disconnect() {
    if (!this.input) return;
    this.input.onmidimessage = null;
    this.input = null;
    this.dispatchEvent(new CustomEvent('disconnected'));
  }

  _handleMessage(event) {
    const [statusByte, note, velocity] = event.data;
    const command = statusByte & 0xf0;
    const timestamp = performance.now();

    if (command === 0x90 && velocity > 0) {
      this.dispatchEvent(new CustomEvent('noteon', { detail: { midi: note, velocity, timestamp } }));
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.dispatchEvent(new CustomEvent('noteoff', { detail: { midi: note, timestamp } }));
    }
    // Sustain pedal (CC 64) and other controllers are intentionally ignored for now.
  }
}
