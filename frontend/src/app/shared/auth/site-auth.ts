import { EnvironmentProviders, Injector, inject } from '@angular/core';
import { provideAnotokiAuth } from '@anotoki/lib/auth';
import { TranslationService } from '@anotoki/lib/translations';
import { BootService } from '../state/boot.service';
import { VisitorKey } from './visitor-key';

/** The IAM's redirect URI: a route of this app (the library's AuthCallbackComponent), registered at the IAM for each origin. */
export const CALLBACK_PATH = '/auth/callback';

/**
 * Where the guards send a sign-in that came back without one, could not
 * start, or cannot be set up: the family's screen (<anotoki-sign-in-failure>)
 * in this app's frame, under its bar.
 */
export const SIGN_IN_FAILED_ROUTE = '/sign-in-failed';

/**
 * The routes a visitor's key goes with: the ones that read and save a
 * visitor's own progress (the backend's requireOwner() routes). Everything
 * else of a visitor's goes without it - the feedback form among it.
 */
export const VISITOR_PREFIXES: readonly string[] = ['/api/state', '/api/progress', '/api/path', '/api/sessions'];

/**
 * Signing in, through the anotoki family's library (@anotoki/lib/auth,
 * anotoki-lib 0.4.1) - the anotoki IAM, and nothing else: the code flow with
 * PKCE, the tokens in this browser's storage under the keys the IAM's SDK
 * kept them under (nobody is signed out by the move), AnotokiAuth's signals
 * (who is signed in, their roles, the account's preferences), its
 * interceptor (a person's token, or a visitor's key, on the API's requests),
 * its guards, its callback page and its screen for a sign-in that did not
 * work. This is what is Piano Academy's own of it:
 *
 * - The backend's sign-in settings: GET /api/auth/config (the library's
 *   AuthRoutes::config()) - the IAM, this app's client id, whether the IAM
 *   requires a sign-in here (failing closed), whether it knows the app.
 * - Visitors (practising without signing in, while the IAM does not require
 *   it): this browser's key (shared/auth/visitor-key.ts), sent only on the
 *   progress routes (VISITOR_PREFIXES). The first save that makes a visitor
 *   goes alone in ApiService, not in the interceptor: a save waiting for it
 *   names the generation that save brings, written only once it is back.
 * - The IAM's pages open in the language read here - one that came with a
 *   bundle, never the kept English nobody chose (signInLanguage()) - and the
 *   failure's screen says its words from the database (the library's
 *   anotoki.signIn.*: migration 011 put this app's wording there).
 * - Before leaving for the IAM, a visitor's saves on their way arrive
 *   (BootService.beforeSignIn()), so the move after the sign-in takes them.
 * - No sign-in by the IAM's hint (the owner's decision: genshin and the build
 *   analyzer only): `hint: false`.
 *
 * BootService is asked for when it is used, never as the configuration is
 * made: it reads AnotokiAuth - a circle otherwise.
 */
export function provideSiteAuth(): EnvironmentProviders {
  return provideAnotokiAuth(() => {
    const i18n = inject(TranslationService);
    const injector = inject(Injector);
    return {
      config: '/api/auth/config',
      visitors: () => injector.get(VisitorKey),
      api: { visitorPrefixes: [...VISITOR_PREFIXES] },
      language: () => i18n.signInLanguage(),
      translate: (key) => i18n.libraryWord(key),
      beforeSignIn: () => injector.get(BootService).beforeSignIn(),
      redirectPath: CALLBACK_PATH,
      failureRoute: SIGN_IN_FAILED_ROUTE,
      hint: false,
    };
  });
}
