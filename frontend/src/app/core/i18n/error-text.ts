import { TranslationParams } from './translation.service';

/**
 * A sign-in that came back without one, or could not start, in the
 * learner's language.
 *
 * Nobody is shown the IAM's or the SDK's own English sentence: the key comes
 * from the code, through the table below and never from the code itself, and
 * the one thing of the IAM's that is shown is the code, inside `{code}`.
 *
 * A learner's own failed requests are worded where they happen (the cards,
 * the "Not saved yet" pill, the signed-out banner, the own progress file's
 * card from its codes) - never with the server's sentence.
 */

/** An OAuth error code, or one of the SDK's own: a short word, nothing a sentence could hide in. */
const FAILURE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

/** The sign-in failures that have a sentence of their own. */
const SIGN_IN_FAILURE_KEYS = new Map<string, string>([
  // The IAM turning the account away, or the person going back from its page - one sentence true either way.
  ['access_denied', 'signIn.notCompleted'],
  // The SDK's own: the browser refused the site's storage, where the sign-in in progress is kept - it never started.
  ['storage_unavailable', 'signIn.storageUnavailable'],
]);

/**
 * The key for a sign-in that came back without one, or could not start.
 * Anything without a sentence of its own is `signIn.failed`, which has a
 * `{code}`: the code (signInFailureParams()), never the IAM's or the SDK's own
 * English sentence.
 */
export function signInFailureKey(code: string): string {
  return SIGN_IN_FAILURE_KEYS.get(code) ?? 'signIn.failed';
}

/** The `{code}` of `signIn.failed`: the code when it looks like one, `unknown` otherwise - it came through the address. */
export function signInFailureParams(code: string): TranslationParams {
  return { code: FAILURE_CODE.test(code) ? code : 'unknown' };
}
