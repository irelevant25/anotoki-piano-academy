import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** One release, as public/changelog.json lists them - newest first. */
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    added?: string[];
    fixed?: string[];
    updated?: string[];
  };
}

/**
 * What changed, release by release: public/changelog.json, the same format as
 * the genshin site's. The newest entry's version is the app's version, shown
 * in the family's footer ("Version 0.4.0"), whose What's new opens the list -
 * both there only once the list came.
 */
@Injectable({ providedIn: 'root' })
export class ChangelogService {
  private readonly http = inject(HttpClient);

  readonly entries = signal<ChangelogEntry[]>([]);
  readonly version = computed(() => this.entries()[0]?.version ?? null);

  async load(): Promise<void> {
    try {
      const entries = await firstValueFrom(this.http.get<ChangelogEntry[]>('changelog.json'));
      this.entries.set(Array.isArray(entries) ? entries : []);
    } catch {
      // No changelog is no reason to stop anybody practising: the footer just shows no version, and no What's new.
      this.entries.set([]);
    }
  }
}
