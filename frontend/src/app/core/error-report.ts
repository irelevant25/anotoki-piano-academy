import { EnvironmentProviders } from '@angular/core';
import { provideAnotokiErrorReport } from '@anotoki/lib/error-report';

/** Where the backend takes a page's own errors: anotoki-lib's ErrorLogRoutes::client() (backend api/routes/public.php). */
export const ERROR_REPORT_ENDPOINT = '/api/client-errors';

/**
 * The browser's errors into this site's error log - the anotoki family's
 * reporter (@anotoki/lib/error-report, anotoki-lib 0.5.0; the owner's
 * decision of 2026-10-11: every site's error log holds its pages' errors).
 * It is the app's ErrorHandler: every error still goes to the console as
 * Angular's own has it, and - scrubbed in the page first (no stored value,
 * token, address or query), at most five a page load, each once - is sent
 * through the app's HttpClient, so the family's interceptors (app.config.ts)
 * treat it as any request: a signed-in person's carries their token (the
 * server counts them by their account), a visitor's goes bare (counted by
 * their address). A failed HTTP request is no error of the page's (the server
 * writes its own); with provideBrowserGlobalErrorListeners() the errors
 * outside Angular's own code arrive too. The admin panel's Error log shows
 * them (`source: client`).
 */
export function provideSiteErrorReport(): EnvironmentProviders {
  return provideAnotokiErrorReport({ endpoint: ERROR_REPORT_ENDPOINT });
}
