import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';

/** One chooser on the page, but ids are made unique all the same. */
let lastId = 0;

/** How near the edge of the screen the menu may come, in px. */
const SCREEN_EDGE = 8;

/**
 * The language the app is read in: one round button in the top bar with the
 * current language's code ("SK"), opening a menu of the languages on offer,
 * each under the name its own speakers give it.
 *
 * A menu button - arrow keys between the items, Escape and a click outside to
 * close - with `menuitemradio` items, because it is one choice out of a few.
 * Each item says which language its own name is in (`lang`), so a screen
 * reader pronounces "Slovenčina" as Slovak. The menu opens downward, under
 * the button, centred on it and moved sideways by as much as it takes to be
 * wholly on the screen - on a phone the button stands near the edge. Tab and
 * Shift+Tab close it with the focus on the button (the top bar's rule: with
 * no zone the menu is removed only at the next render, and the browser's Tab
 * would land on an item about to go - then on <body>).
 *
 * Drawn only while more than one language is on offer - so not at all while
 * the app has no strings from the server (the list comes with the bundle).
 */
@Component({
  selector: 'app-language-switcher',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  host: {
    '[hidden]': '!offered()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
})
export class LanguageSwitcherComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);

  private readonly _id = ++lastId;
  protected readonly buttonId = `language-button-${this._id}`;
  protected readonly menuId = `language-menu-${this._id}`;

  /** There is something to choose between. */
  protected readonly offered = computed(() => this.i18n.languages().length > 1);
  protected readonly open = signal(false);
  /** The chosen language's strings are on their way. */
  protected readonly switching = signal(false);
  /** The last choice could not be loaded: said beside the button (worded in the template) until the next press. */
  protected readonly failed = signal(false);
  /** The current language as its speakers write it; its code while the list does not name it. */
  protected readonly currentName = computed(() => {
    const code = this.i18n.language();
    return this.i18n.languages().find((language) => language.code === code)?.nativeName ?? code.toUpperCase();
  });

  /** Counts the choices made: only the last one's answer is acted on. */
  private _choice = 0;

  private readonly _button = viewChild<ElementRef<HTMLButtonElement>>('button');
  private readonly _menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly _note = viewChild<ElementRef<HTMLElement>>('note');

  constructor() {
    // Whichever of the two has just been drawn over the button - measured once it is on the page.
    afterRenderEffect(() => this._keepOnScreen(this._menu()?.nativeElement));
    afterRenderEffect(() => this._keepOnScreen(this._note()?.nativeElement));
  }

  protected toggle(): void {
    this.failed.set(false);
    if (this.open()) {
      this.close(true);
    } else {
      this.open.set(true);
      // Into the menu once it is drawn, onto the language in use - as a menu of radio items is expected to open.
      afterNextRender(
        () => {
          const items = this._items();
          (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
        },
        { injector: this._injector },
      );
    }
  }

  close(returnFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this._button()?.nativeElement.focus();
    }
  }

  /**
   * Switches once the language's strings have come; says so when they could
   * not be had, and stays as it was.
   *
   * The last choice wins. The button stays usable while a language is on its
   * way, so somebody may change their mind - back to the language on the page
   * too, which is then a choice like any other and is handed to the service
   * (it drops the one on its way). Only the last choice's answer is listened
   * to: an earlier one comes back false for having been overtaken, and that
   * is nothing to tell anybody.
   */
  protected async choose(code: string): Promise<void> {
    this.close(true);
    this.failed.set(false);
    if (code === this.i18n.language() && !this.switching()) {
      return;
    }
    const mine = ++this._choice;
    this.switching.set(true);
    const switched = await this.i18n.setLanguage(code);
    if (mine !== this._choice) {
      return;
    }
    this.switching.set(false);
    this.failed.set(!switched);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this._host.nativeElement.contains(event.target as Node)) {
      return;
    }
    this.failed.set(false);
    if (this.open()) {
      this.close(false);
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this._items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this.close(true);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  /**
   * The menu and the note stand centred under the button, and on a phone the
   * button stands near the right edge of the bar: half of what is drawn
   * would then be off the screen, and the page would scroll sideways. So it
   * is measured once it is drawn and moved by what it takes (the styles'
   * `--shift`) - the right edge first, and never past the left one.
   */
  private _keepOnScreen(element: HTMLElement | undefined): void {
    if (!element) {
      return;
    }
    element.style.setProperty('--shift', '0px');
    const box = element.getBoundingClientRect();
    const screen = document.documentElement.clientWidth;
    let shift = 0;
    if (box.right > screen - SCREEN_EDGE) {
      shift = screen - SCREEN_EDGE - box.right;
    }
    if (box.left + shift < SCREEN_EDGE) {
      shift = SCREEN_EDGE - box.left;
    }
    element.style.setProperty('--shift', `${Math.round(shift)}px`);
  }

  private _items(): HTMLElement[] {
    const menu = this._menu()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) : [];
  }
}
