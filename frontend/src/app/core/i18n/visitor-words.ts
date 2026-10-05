/**
 * The words of practising without signing in - when the IAM says Piano
 * Academy does not require it - and how a refused save of a visitor's is
 * worded. Migration 005 wrote the keys with their English and Slovak; the
 * shell and Stats draw them (with the visitor's notice, the notes after a
 * sign-in, and the progress file's place on Stats).
 *
 * A learner never sees the server's sentence: a visitor's refused save is
 * worded from its code here, as the sign-in card words a failure in
 * error-text.ts.
 */

/**
 * How many days the server keeps a visitor's progress after their last
 * visit - the `{days}` of visitor.notice and visitor.lost. The backend's
 * VISITOR_KEEP_DAYS (api/visitors.php); a test there holds the two equal.
 */
export const VISITOR_KEEP_DAYS = 30;

/** The keys, by where they show. */
export const VISITOR_WORDS = {
  /** Under the top bar on Learn and Stats, with the Sign in button: `{days}`. */
  notice: 'visitor.notice',
  /** After a sign-in that moved this browser's progress into the account. */
  moved: 'visitor.moved',
  /** Beside `moved`, when the account had progress of its own for some of it. */
  kept: 'visitor.kept',
  /** After a sign-in whose move did not happen this time (it is asked again on the next visit). */
  notMoved: 'visitor.notMoved',
  /** The visitor's progress is gone from the server (unused for `{days}` days, or moved at a sign-in). */
  lost: 'visitor.lost',
  /** Sign-in became required while visiting, with the Sign in button. */
  signInNow: 'visitor.signInNow',
  /** A save refused because this browser keeps as much as a visitor may. */
  full: 'visitor.full',
  /** A first save refused because too many people started without signing in this hour. */
  busy: 'visitor.busy',
  /** Closes `moved`, `notMoved` and `lost`. */
  close: 'visitor.close',
  /** Stats, in place of the progress file's card, with the Sign in button. */
  ownProgress: 'ownProgress.visitor',
} as const;

/**
 * The words for a visitor's refused save, from the server's answer - or null
 * when it is not one of the refusals that only a visitor meets (the caller
 * asks only for a visitor's or a new visitor's save):
 *
 *  - 422 visitor_limit (as many rounds as a visitor keeps) and 413 too_large
 *    (a document over a visitor's size): this browser cannot keep more;
 *  - 429 too_many_visitors (too many new visitors this hour, or at once):
 *    busy - try later, or sign in.
 */
export function visitorRefusalKey(
  status: number,
  code: string | undefined,
): string | null {
  if (
    (status === 422 && code === 'visitor_limit') ||
    (status === 413 && code === 'too_large')
  ) {
    return VISITOR_WORDS.full;
  }
  if (status === 429 && code === 'too_many_visitors') {
    return VISITOR_WORDS.busy;
  }
  return null;
}
