import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ANOTOKI_LEGAL_CONFIG } from '@anotoki/lib/legal';
import { pianoLegalPagesConfig } from '../legal-facts';

/**
 * The legal pages' frame - Terms, Privacy and Contact, the anotoki family's
 * pages (@anotoki/lib/legal/pages, each a lazy route of its own in
 * sites/main/main.routes.ts), and About and Support (@anotoki/lib/legal/about, /support,
 * the same on every anotoki site): the app's own frame is the shell's
 * (app.component - the top bar, the column, the footer with the links to
 * them), so this one only gives the legal pages Piano Academy's facts
 * (sites/main/legal/legal-facts.ts), which only they read - loaded with the first of
 * them that is opened, out of the first load.
 *
 * Anybody may read them, signed in or not, a visitor or not: what an app keeps
 * is said before anybody signs in to it. So no guard stands in front of them,
 * the shell draws them whatever its start says (AppComponent's pageShown), and
 * nothing here asks for a sign-in or for anybody's progress. While the site is
 * not ready, the family's status page stands instead of them, as instead of
 * every page.
 */
@Component({
  selector: 'app-legal-layout',
  imports: [RouterOutlet],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: pianoLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-layout.component.html',
  styleUrl: './legal-layout.component.scss',
})
export class LegalLayoutComponent {}
