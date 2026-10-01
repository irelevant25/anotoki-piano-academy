import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * The access token on every call to this app's own API, in auth mode 'iam' -
 * refreshed before it runs out, and once more after a 401 (the SDK's own
 * fetch does the same; this is it for HttpClient). The sign-in settings
 * themselves need no token, and without sign-in nothing is added.
 *
 * Nor do the app's strings (GET /api/translations/{code}): they are public,
 * asked for before anybody is signed in, and must not wait for a token to be
 * refreshed. The owner's translation calls are under /api/owner/ and carry
 * the token like every other call.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);

  if (!auth.usesSignIn() || !request.url.startsWith('/api/') || request.url === '/api/auth/config' || request.url.startsWith('/api/translations/')) {
    return next(request);
  }

  const withToken = (token: string | null): HttpRequest<unknown> =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return from(auth.accessToken()).pipe(
    switchMap((token) => next(withToken(token)).pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !token) {
          return throwError(() => error);
        }
        // One retry, and only with a token that is actually different.
        return from(auth.refreshToken()).pipe(
          switchMap((renewed) => (renewed && renewed !== token ? next(withToken(renewed)) : throwError(() => error))),
        );
      }),
    )),
  );
};
