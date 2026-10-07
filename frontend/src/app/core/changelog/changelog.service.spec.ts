import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import manifest from '../../../../package.json';
import shipped from '../../../../public/changelog.json';
import { ChangelogService } from './changelog.service';

/** A release's version: three numbers, MAJOR.MINOR.PATCH - big changes, new features, bug fixes. */
const THREE_NUMBERS = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Above 0 when `a` is the newer of two such versions, number by number. */
function newer(a: string, b: string): number {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

describe('the list of changes the app ships (public/changelog.json)', () => {
  const versions = shipped.map((entry) => entry.version);

  it('names every release with three numbers, MAJOR.MINOR.PATCH, the newest first', () => {
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.filter((version) => !THREE_NUMBERS.test(version))).toEqual([]);
    for (let i = 1; i < versions.length; i++) {
      expect(newer(versions[i - 1], versions[i]), `${versions[i - 1]} before ${versions[i]}`).toBeGreaterThan(0);
    }
  });

  it('has as its newest release the version in package.json - what the footer shows is the frontend\'s version', () => {
    expect(versions[0]).toBe(manifest.version);
  });
});

describe('ChangelogService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('takes the newest entry\'s version as it stands - and none when the list does not come', async () => {
    const changelog = TestBed.inject(ChangelogService);
    const http = TestBed.inject(HttpTestingController);

    const loading = changelog.load();
    http.expectOne('changelog.json').flush([{ version: '0.4.0', date: '2026-10-07', changes: {} }, { version: '0.3.0', date: '2026-10-06', changes: {} }]);
    await loading;
    expect(changelog.version()).toBe('0.4.0');

    const failing = changelog.load();
    http.expectOne('changelog.json').flush('Not found', { status: 404, statusText: 'Not Found' });
    await failing;
    expect(changelog.version()).toBeNull();
    http.verify();
  });
});
