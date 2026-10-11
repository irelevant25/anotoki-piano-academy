import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { provideFamilyKit } from '../../core/family-kit';
import { MidiService } from '../../core/midi/midi.service';
import { provideTestKit } from '../../core/testing/test-kit';
import { MidiPanelComponent } from './midi-panel.component';

const SLOVAK = {
  'midi.button': '{label}: {status}',
  'midi.none': 'Bez klavíra',
  'midi.title': 'Tvoj klavír',
  'midi.connected': 'Pripojené: {name}',
  'midi.notConnected': 'Klavír nie je pripojený',
  'midi.refused': 'Prehliadač nepovolil MIDI',
  'midi.device': 'Vstupné zariadenie MIDI',
  'midi.noDevices': 'Nenašli sa žiadne zariadenia MIDI',
  'midi.connect': 'Pripojiť',
  'midi.rescan': 'Znova vyhľadať zariadenia MIDI',
};

describe('MidiPanelComponent: the piano in the top bar', () => {
  let fixture: ComponentFixture<MidiPanelComponent>;
  let host: HTMLElement;
  let midi: MidiService;

  // The family's box asks jsdom for what it lacks (checkVisibility(), popovers).
  beforeAll(() => provideTestKit());

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk' }), provideFamilyKit()] });
    midi = TestBed.inject(MidiService);
    fixture = TestBed.createComponent(MidiPanelComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  });

  afterEach(() => host.remove());

  const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => host.querySelector<T>(selector)!;
  const box = (): HTMLElement | null => host.querySelector('#midi-box');
  /** A click, the box drawn and placed after it (the family's popover opens on the next render). */
  const settle = async (): Promise<void> => {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  };

  it('says the state at a glance - the dot, "no piano" or the device\'s own name - and whole in its name', async () => {
    expect($('#midi-button').classList.contains('is-connected')).toBe(false);
    expect($('#midi-label').textContent?.trim()).toBe('Bez klavíra');
    expect($('#midi-button').getAttribute('aria-label')).toBe('Bez klavíra: Klavír nie je pripojený');
    expect($('#midi-button').getAttribute('title')).toBe('Klavír nie je pripojený');

    midi.connectedName.set('KAWAI ES120');
    await fixture.whenStable();
    expect($('#midi-button').classList.contains('is-connected')).toBe(true);
    expect($('#midi-label').textContent?.trim()).toBe('KAWAI ES120');
    expect($('#midi-button').getAttribute('aria-label')).toBe('KAWAI ES120: Pripojené: KAWAI ES120');
    // Label in name: the name starts with what the button shows.
    expect($('#midi-button').getAttribute('aria-label')?.startsWith($('#midi-label').textContent?.trim() ?? '-')).toBe(true);

    // The browser's own reason, after the app's sentence - English, and marked so in the box.
    midi.connectedName.set(null);
    midi.problem.set({ kind: 'refused', detail: 'Permission denied.' });
    await fixture.whenStable();
    expect($('#midi-button').getAttribute('aria-label')).toBe('Bez klavíra: Prehliadač nepovolil MIDI: Permission denied.');
    $<HTMLButtonElement>('#midi-button').click();
    await settle();
    expect($('#midi-status span[lang="en"]').textContent).toBe('Permission denied.');
  });

  it('on a phone: the dot and the icon, no name', async () => {
    fixture.componentRef.setInput('compact', true);
    await fixture.whenStable();
    expect(host.querySelector('#midi-label')).toBeNull();
    expect($('#midi-button').getAttribute('aria-label')).toBe('Bez klavíra: Klavír nie je pripojený');
  });

  it('opens its box - the family\'s, a named group - onto the device list; Escape closes it onto the button', async () => {
    const button = $<HTMLButtonElement>('#midi-button');
    expect(box()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    await settle();
    expect(box()).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = host.querySelector('anotoki-popover [role="group"]')!;
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-label')).toBe('Tvoj klavír');
    expect($('#midi-box-title').textContent).toBe('Tvoj klavír');
    expect(document.activeElement).toBe($('#midi-device-select'));

    $('#midi-device-select').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(box()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('closes on the button again, on a click outside, and when the focus leaves it', async () => {
    const button = $<HTMLButtonElement>('#midi-button');
    button.click();
    await settle();
    button.click();
    await settle();
    expect(box()).toBeNull();

    button.click();
    await settle();
    document.body.click();
    await settle();
    expect(box()).toBeNull();

    button.click();
    await settle();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    $('#midi-refresh-btn').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    await settle();
    expect(box()).toBeNull();
    outside.remove();
  });

  it('Connect and Rescan do what they say', async () => {
    const connect = vi.spyOn(midi, 'connect').mockImplementation(() => undefined);
    const refresh = vi.spyOn(midi, 'refresh').mockResolvedValue(undefined);
    $<HTMLButtonElement>('#midi-button').click();
    await settle();
    $<HTMLButtonElement>('#midi-connect-btn').click();
    $<HTMLButtonElement>('#midi-refresh-btn').click();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect($('#midi-refresh-btn').getAttribute('aria-label')).toBe('Znova vyhľadať zariadenia MIDI');
  });
});
