/** How near the edge of the screen a box under a button of the bar may come, in px. */
const SCREEN_EDGE = 8;

/**
 * A menu or a note drawn under one of the top bar's round buttons (the
 * language chooser's, the theme button's) stands centred under it, and on a
 * phone those buttons stand near the right edge of the bar: half of what is
 * drawn would be off the screen, and the page would scroll sideways. So it is
 * measured once it is drawn and moved by what it takes - its styles'
 * `--shift` - the right edge first, and never past the left one.
 */
export function keepOnScreen(element: HTMLElement | undefined): void {
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
