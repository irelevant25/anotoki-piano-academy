import { ApiError } from '../../core/api/api.service';

/**
 * What the owner's two pages say when a call did not work. They are the only
 * pages that show the server's own English sentence (`details.error`): they
 * are English themselves, and the owner is the one person it is written for.
 */

/** The sign-in is over: ApiService sent nothing, or the server took no token. What was typed is kept for the way back. */
export function signedOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Somebody else is signed in now, in another tab: ApiService sends nothing under their name. */
export function otherPerson(error: unknown): boolean {
  return error instanceof ApiError && error.wrongUser;
}

/** Something of the refusal's body, when it is a text: the key or the language a refused string is about. */
export function errorDetail(error: unknown, name: string): string | null {
  const value = error instanceof ApiError ? error.details?.[name] : null;
  return typeof value === 'string' ? value : null;
}

/** The server's code for what went wrong, when it gave one. */
export function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

/** One sentence (or two) for a call that did not work. */
export function ownerErrorText(error: unknown): string {
  if (signedOut(error)) {
    return 'You are signed out. Sign in again - what you typed is kept in this tab.';
  }
  if (otherPerson(error)) {
    return 'Somebody else is signed in now, in another tab, and nothing is sent under their name. What you typed is still in its boxes.';
  }
  const sentence = errorDetail(error, 'error');
  if (sentence !== null && sentence.trim() !== '') {
    return sentence;
  }
  if (error instanceof ApiError && error.status === 0) {
    return 'The server could not be reached. Check the connection and try again.';
  }
  return error instanceof ApiError ? `The server answered with an error (${error.status}). Try again.` : 'Something went wrong. Try again.';
}
