/**
 * The app's own words as the API sends them (backend/api/translations.php):
 * the bundle every page starts with, and what the owner's Languages and
 * Translations pages read and write.
 */

/** A language the app can be read in: what the chooser offers. */
export interface SiteLanguage {
  code: string;
  /** In English: "Slovak". */
  name: string;
  /** As its speakers write it: "Slovenčina" - what the chooser shows. */
  nativeName: string;
}

/**
 * GET /api/translations/{code}: the strings of one language with English
 * merged underneath, and the languages on offer. The server also sends
 * English itself beside another language (`english`): what the admin panel
 * reads, which is English whatever the learner chose (the top bar there).
 */
export interface TranslationBundle {
  /**
   * The language that answered: the one asked for; its base language for a
   * regional code the app does not have (`sk` for `sk-sk`); `en` when the one
   * asked for is unknown or switched off.
   */
  language: string;
  languages: SiteLanguage[];
  values: Record<string, string>;
  /** English's own strings, beside another language; left out when `language` is English (`values` are). */
  english?: Record<string, string>;
}

/** A language as the owner's pages see it: the hidden ones too. */
export interface OwnerLanguage extends SiteLanguage {
  /** Offered in the chooser. */
  enabled: boolean;
  sortOrder: number;
  /** The migrations write strings for it, so it cannot be deleted. */
  seeded: boolean;
}

/** What a new language is made of; it is sorted last, and hidden unless `enabled` says otherwise. */
export interface NewLanguage {
  code: string;
  name: string;
  nativeName: string;
  enabled?: boolean;
}

/** What PUT /api/owner/languages/{code} may change. */
export interface LanguageChanges {
  name?: string;
  nativeName?: string;
  enabled?: boolean;
  sortOrder?: number;
}

/** One key of the app's words, with its string in every language that has one. */
export interface TranslationKeyRow {
  name: string;
  /** Where it is shown, and what its {placeholders} are. */
  description: string | null;
  values: Record<string, string>;
}

/** GET and PUT /api/owner/translations: every language and every key, ordered by name. */
export interface TranslationGrid {
  languages: OwnerLanguage[];
  keys: TranslationKeyRow[];
}

/** The cells a save changes: key -> language code -> text (blank deletes the row, except for English). */
export type TranslationChanges = Record<string, Record<string, string>>;
