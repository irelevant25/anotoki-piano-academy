import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, tap, throwError } from 'rxjs';
import { CARRIES_VISITOR_KEY, Caller, ISSUED_AS } from '../api/api.service';
import { AuthService } from './auth.service';
import { VISITOR_KEY_HEADER, VisitorKey } from './visitor-key';

/**
 * Who a call of this app's own API is - decided when it was ISSUED
 * (`ISSUED_AS`, which ApiService sets from the page's data owner as it makes
 * the request; one without it is decided here as it is handed over), never
 * from whether a token happens to be there when it leaves:
 *
 * - **A person's**: the IAM access token - refreshed before it runs out, and
 *   once more after a 401 (the SDK's own fetch does the same; this is it for
 *   HttpClient). When there is no token to send (the refresh failed, signed
 *   out in another tab) the request is **never sent**: it fails here as a 401
 *   `sign_in_required`, and the page's signed-out handling takes over - it
 *   never goes out as a visitor's, and never makes one. Never the visitor key
 *   - but on the move after a sign-in (`CARRIES_VISITOR_KEY`), the one
 *   request that carries both, which set the key itself. A key in a person's
 *   answer is ignored.
 * - **A visitor's**, while the IAM does not require a sign-in
 *   (`auth.loginRequired()`): the visitor key this browser holds now
 *   (core/auth/visitor-key.ts, read as the request leaves), if any; never a
 *   token. The answer that made a visitor - a save sent with no key - brings
 *   the new key in its `X-Visitor-Key` header, and it is kept (the first key
 *   stays). A 401 `visitor_unknown` forgets the key that was sent (only while
 *   it is still the one held); a 401 `sign_in_required` means the IAM requires
 *   a sign-in now (`auth.requireSignInNow()`) - and the key is KEPT, for the
 *   next sign-in's move.
 * - **A visitor's while a sign-in is required**: neither key nor token (the
 *   key stays where it is). ApiService sends none such; this is the guard.
 *
 * The sign-in settings (/api/auth/config), the app's strings
 * (/api/translations/...) and where the site stands (/api/site-status) go
 * untouched: they are public, asked for before anybody is signed in, and must
 * not wait for a token to be refreshed - nor carry a visitor's key. The admin
 * panel's calls (/api/admin/...: the Migrations page's too, which the family's
 * page makes itself) and a person's own file (/api/me/...) are a person's like
 * every other signed-in call.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/') || request.url === '/api/auth/config' || request.url === '/api/site-status' || request.url.startsWith('/api/translations/')) {
    return next(request);
  }
  const auth = inject(AuthService);
  const caller: Caller = request.context.get(ISSUED_AS) ?? (auth.signedIn() ? 'person' : 'visitor');
  return caller === 'person' ? asPerson(request, next, auth) : asVisitor(request, next, auth, inject(VisitorKey));
};

/** A person's request: with the token, or not at all. */
function asPerson(request: HttpRequest<unknown>, next: HttpHandlerFn, auth: AuthService): Observable<HttpEvent<unknown>> {
  if (!request.context.get(CARRIES_VISITOR_KEY)) {
    request = request.clone({ headers: request.headers.delete(VISITOR_KEY_HEADER) });
  }
  return from(auth.accessToken()).pipe(
    switchMap((token) => {
      if (!token) return throwError(() => notSignedIn(request));
      return next(withToken(request, token)).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
          // One retry, and only with a token that is actually different.
          return from(auth.refreshToken()).pipe(switchMap((renewed) => (renewed && renewed !== token ? next(withToken(request, renewed)) : throwError(() => error))));
        }),
      );
    }),
  );
}

/** A visitor's request: the key held now, if any - and the key a new visitor gets - while no sign-in is required; else bare. */
function asVisitor(request: HttpRequest<unknown>, next: HttpHandlerFn, auth: AuthService, visitor: VisitorKey): Observable<HttpEvent<unknown>> {
  const bare = request.clone({ headers: request.headers.delete(VISITOR_KEY_HEADER).delete('Authorization') });
  if (auth.loginRequired()) return next(bare);
  const key = visitor.current();
  return next(key ? bare.clone({ setHeaders: { [VISITOR_KEY_HEADER]: key } }) : bare).pipe(
    tap((event) => {
      const made = !key && event instanceof HttpResponse ? event.headers.get(VISITOR_KEY_HEADER) : null;
      if (made) visitor.remember(made);
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const code = (error.error as { code?: unknown } | null)?.code;
        if (code === 'visitor_unknown' && key) visitor.forget(key, true);
        // The IAM requires a sign-in now; the key is kept for the move after it.
        if (code === 'sign_in_required') auth.requireSignInNow();
      }
      return throwError(() => error);
    }),
  );
}

/** What a person's request with no token answers, without being sent: what the API would say. */
function notSignedIn(request: HttpRequest<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 401,
    statusText: 'Unauthorized',
    url: request.urlWithParams,
    error: { error: 'Sign in to continue.', code: 'sign_in_required' },
  });
}

function withToken<T>(request: HttpRequest<T>, token: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
