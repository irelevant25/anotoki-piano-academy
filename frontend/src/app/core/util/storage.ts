// localStorage that never throws: a browser that refuses storage (private
// mode on some engines, storage switched off) gets null back and nothing kept.

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes $value, or removes the key for null. False when the browser would not keep it. */
export function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
