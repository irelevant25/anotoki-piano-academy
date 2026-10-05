import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { VISITOR_STORAGE_KEY, VisitorKey } from './visitor-key';

const KEY = 'k'.repeat(43);
const OTHER_KEY = 'o'.repeat(43);

describe('VisitorKey: the key a visitor’s progress is found by, kept by this browser', () => {
  const signedIn = signal(false);
  const loginRequired = signal(false);
  let visitor: VisitorKey;

  function make(): VisitorKey {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { signedIn: () => signedIn(), loginRequired: () => loginRequired() } }] });
    return TestBed.inject(VisitorKey);
  }

  beforeEach(() => {
    localStorage.clear();
    signedIn.set(false);
    loginRequired.set(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reads the key the browser holds - in every tab, as it is now - and nothing that is not of a key’s shape', () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    visitor = make();
    expect(visitor.key()).toBe(KEY);

    localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
    expect(visitor.current()).toBe(OTHER_KEY);
    expect(visitor.key()).toBe(OTHER_KEY);

    for (const junk of ['', 'short', 'k'.repeat(44), `${'k'.repeat(42)}=`, `${'k'.repeat(42)}/`]) {
      localStorage.setItem(VISITOR_STORAGE_KEY, junk);
      expect(visitor.current()).toBeNull();
    }
  });

  it('keeps the first key: a second one made a moment later (another tab’s) never overwrites it', () => {
    visitor = make();
    visitor.remember(KEY);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
    visitor.remember(OTHER_KEY);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
    expect(visitor.key()).toBe(KEY);
  });

  it('remembers nothing that is not of a key’s shape', () => {
    visitor = make();
    visitor.remember('not a key');
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    expect(visitor.key()).toBeNull();
  });

  it('forgets a key only while it is still the one held - and says it was lost only when asked to', () => {
    visitor = make();
    visitor.remember(KEY);
    visitor.forget(OTHER_KEY, true);
    expect(visitor.current()).toBe(KEY);
    expect(visitor.lost()).toBe(false);

    visitor.forget(KEY);
    expect(visitor.current()).toBeNull();
    expect(visitor.lost()).toBe(false);

    visitor.remember(KEY);
    visitor.forget(KEY, true);
    expect(visitor.lost()).toBe(true);
    // A new key: nothing is lost any more.
    visitor.remember(OTHER_KEY);
    expect(visitor.lost()).toBe(false);
  });

  it('follows another tab: the storage event', () => {
    visitor = make();
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: VISITOR_STORAGE_KEY, newValue: KEY }));
    expect(visitor.key()).toBe(KEY);

    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(visitor.key()).toBeNull();
  });

  it('keeps the key in the tab’s memory when the browser refuses its storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('refused', 'SecurityError');
    });
    visitor = make();
    visitor.remember(KEY);
    expect(visitor.current()).toBe(KEY);
    visitor.remember(OTHER_KEY);
    expect(visitor.current()).toBe(KEY);
    visitor.forget(KEY, true);
    expect([visitor.current(), visitor.lost()]).toEqual([null, true]);
  });

  it('is a visitor now only with a key held, nobody signed in, and no sign-in required', () => {
    visitor = make();
    expect(visitor.active()).toBe(false);
    visitor.remember(KEY);
    expect(visitor.active()).toBe(true);
    signedIn.set(true);
    expect(visitor.active()).toBe(false);
    signedIn.set(false);
    loginRequired.set(true);
    expect(visitor.active()).toBe(false);
    // Kept while a sign-in is required: the sign-in moves it.
    expect(visitor.key()).toBe(KEY);
  });
});
