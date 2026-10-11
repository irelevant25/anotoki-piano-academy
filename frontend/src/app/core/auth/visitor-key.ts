import { DestroyRef, Injectable, computed, inject, signal, untracked } from '@angular/core';
import { AnotokiAuth, VisitorKeyStore } from '@anotoki/lib/auth';
import { readStorage, writeStorage } from '../util/storage';

/** Where this browser keeps its visitor key (localStorage: every tab of the app shares it). */
export const VISITOR_STORAGE_KEY = 'piano-academy:visitor';

/** A key as the server makes them: 32 random bytes, base64url without padding. Anything else is no key. */
export const VISITOR_KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The visitor key: what lets somebody who has not signed in keep their
 * progress while the IAM does not require a sign-in here
 * (AnotokiAuth.loginRequired). The server makes it on the first save of
 * somebody with neither a token nor a key and sends it once, in the
 * `X-Visitor-Key` header of that answer; it keeps only its hash. This browser
 * keeps the key in localStorage, and the family's interceptor
 * (@anotoki/lib/auth: this is the site's key store it is given,
 * core/auth/site-auth.ts) sends it on the progress routes' requests ApiService
 * issued as a visitor's (ISSUED_AS) - never on a person's, but for the move
 * after a sign-in.
 *
 * - **Read at send time.** `current()` reads storage on every request, and a
 *   `storage` event keeps the `key` signal in step, so every tab sends the key
 *   the browser holds now - not one it read at its start.
 * - **The first key stays.** Two tabs that each saved first both get a key;
 *   the second never overwrites the stored one (`remember()`). What it saved
 *   is left behind on the server, which deletes it with the visitors unseen
 *   for 30 days.
 * - **Kept, not sent, while the IAM requires a sign-in**: the server would
 *   refuse it (401 sign_in_required), and a refusal of that kind never
 *   forgets it - the next sign-in moves what it holds into the account, and
 *   the requirement switched off again within the 30 days brings it back.
 * - **Forgotten** when the server no longer knows it (401 `visitor_unknown`:
 *   swept, or moved into an account in another tab) - `lost` says so, for the
 *   page to word once - and after the move at a sign-in (BootService). Always
 *   compare-and-delete: only while the stored key is still the one that was
 *   sent.
 *
 * A browser that refuses storage: the key lives in memory for the tab.
 *
 * This service reads AnotokiAuth and nothing else; the family's module is
 * given it as a function, read when a request needs it, and the move is
 * BootService's (it needs ApiService, which needs this) - no circle.
 */
@Injectable({ providedIn: 'root' })
export class VisitorKey implements VisitorKeyStore {
  private readonly auth = inject(AnotokiAuth);

  /** The key, while storage cannot keep it (or would not). */
  private memory: string | null = null;
  private inMemory = false;
  private readonly _key = signal<string | null>(null);

  /** The key this browser holds, or null. */
  readonly key = this._key.asReadonly();
  /** A visitor now: nobody signed in, no sign-in required, and a key held. */
  readonly active = computed(() => !this.auth.signedIn() && !this.auth.loginRequired() && this._key() !== null);
  /** The key was forgotten because the server no longer knew it: the page says so, once. */
  readonly lost = signal(false);

  constructor() {
    this._key.set(this.read());
    // Another tab stored or forgot the key (null: the whole storage was cleared).
    const onStorage = (event: StorageEvent) => {
      if (event.key === VISITOR_STORAGE_KEY || event.key === null) this._key.set(this.read());
    };
    globalThis.addEventListener?.('storage', onStorage);
    inject(DestroyRef).onDestroy(() => globalThis.removeEventListener?.('storage', onStorage));
  }

  /** The key held now, read from storage - what a request sends. */
  current(): string | null {
    const key = this.read();
    if (key !== untracked(this._key)) this._key.set(key);
    return key;
  }

  /**
   * A key the server just made. Kept only when this browser holds none: a key
   * already stored (another tab's, made a moment earlier) stays, and this one
   * is dropped. Anything not of a key's shape is no key.
   */
  remember(key: string): void {
    if (!VISITOR_KEY_SHAPE.test(key)) return;
    if (this.read() === null) {
      this.write(key);
      this.lost.set(false);
    }
    this._key.set(this.read());
  }

  /**
   * Forgets `key` - only while it is still the one held (another tab may have
   * stored a new one meanwhile). `lost`: because the server no longer knew it.
   */
  forget(key: string, lost = false): void {
    if (this.read() === key) {
      this.write(null);
      if (lost) this.lost.set(true);
    }
    this._key.set(this.read());
  }

  private read(): string | null {
    const value = this.inMemory ? this.memory : readStorage(VISITOR_STORAGE_KEY);
    return value !== null && VISITOR_KEY_SHAPE.test(value) ? value : null;
  }

  private write(value: string | null): void {
    this.memory = value;
    if (this.inMemory) return;
    if (!writeStorage(VISITOR_STORAGE_KEY, value) || readStorage(VISITOR_STORAGE_KEY) !== value) {
      // Storage would not keep it (refused, or a full quota): from now on the key lives in this tab's memory.
      this.inMemory = true;
    }
  }
}
