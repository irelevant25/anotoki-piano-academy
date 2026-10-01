import { TranslationParams } from './translation.service';

/**
 * A sign-in that came back without one, in the learner's language.
 *
 * Nobody is shown the IAM's or the SDK's own English sentence: the key comes
 * from the code, through the two cases below and never from the code itself,
 * and the one thing of the IAM's that is shown is the code, inside `{code}`.
 *
 * Nothing else is here on purpose: this app never words a failed request for
 * a learner - the cards, the "Not saved yet" pill and the signed-out banner
 * say what happened.
 */

/** An OAuth error code, or one of the SDK's own: a short word, nothing a sentence could hide in. */
const FAILURE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * The key for a sign-in that came back without one. `access_denied` is the IAM
 * turning the account away, or the person going back from its page - one
 * sentence that is true either way. Anything else is `signIn.failed`, which
 * has a `{code}`: the code (signInFailureParams()), never the IAM's or the
 * SDK's own English sentence.
 */
export function signInFailureKey(code: string): string {
  return code === 'access_denied' ? 'signIn.notCompleted' : 'signIn.failed';
}

/** The `{code}` of `signIn.failed`: the code when it looks like one, `unknown` otherwise - it came through the address. */
export function signInFailureParams(code: string): TranslationParams {
  return { code: FAILURE_CODE.test(code) ? code : 'unknown' };
}
