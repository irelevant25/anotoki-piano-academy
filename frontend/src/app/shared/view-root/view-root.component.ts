import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The page's place in the shell (app.component): the learner's site's <main id="view-root"> - or, for the admin panel,
 * whose frame (@anotoki/lib/admin/frame) has a <main> of its own, nothing round it (`bare`): one <main> a page.
 *
 * What the shell gives it - the router's one outlet, or a card of the start - is made once, by the shell, and only
 * moved between the two places: the one <ng-content> sits in a template drawn in whichever place is in use. So the
 * page in the outlet is never made twice when an address crosses from one half to the other (two outlets, one in each
 * place, would make the page anew in the second as the first went), and a page stays the same page while the start
 * moves on under it (an ADMIN's Migrations page after an Apply).
 */
@Component({
  selector: 'app-view-root',
  imports: [NgTemplateOutlet],
  templateUrl: './view-root.component.html',
  styleUrl: './view-root.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewRootComponent {
  /** No <main> round the page: the admin panel's frame draws its own. */
  readonly bare = input(false);
}
