/**
 * The keys that are put together at run time: prefix -> every tail the code
 * can add to it. A key is never built from anything open - an address, the
 * IAM's answer, a stored session, what a person typed - only from these closed
 * sets, which are the app's own ids.
 *
 * This file is read, as text, by the backend's key scan
 * (backend/tools/translation_keys.php), which cannot see a key that is never
 * written out whole: every key listed here (or its plural family) must exist
 * in the database, and a database key under one of these prefixes that is not
 * listed is unused. A key put together from a prefix this table does not
 * declare is a problem the scan reports.
 *
 * So an entry is a prefix ending in a dot, in quotes, and its tails written
 * out as a list of quoted strings - never a list made by code (a spread, a
 * map over a constant), which the scan cannot read.
 *
 * The four families here are the learning path's own sentences, worded by
 * path-words.ts from PathService's ids (shared/music/path.service.ts); the
 * spec beside that file holds this table and the path in step.
 */
export const DYNAMIC_KEYS: Record<string, readonly string[]> = {
  // A phase's name and the line under it: <phase id>.title, <phase id>.description.
  'path.phase.': [
    'right-hand.title',
    'right-hand.description',
    'left-hand.title',
    'left-hand.description',
    'hands-together.title',
    'hands-together.description',
    'left-hand-chords.title',
    'left-hand-chords.description',
    'right-hand-chords.title',
    'right-hand-chords.description',
    'melody-and-chords.title',
    'melody-and-chords.description',
  ],
  // A step type's name in full and on a chip: <type>.title, <type>.short.
  'path.step.': ['meet.title', 'meet.short', 'drill.title', 'drill.short', 'read.title', 'read.short', 'tempo.title', 'tempo.short', 'song.title', 'song.short'],
  // Where a new note's key sits, by its MIDI number (the meet step).
  'path.hint.': ['60', '62', '64', '65', '67', '69', '71', '72'],
  // The unit titles that have ordinary words in them; a title of note letters only has no key.
  'path.unit.': ['rh-5.title'],
};
