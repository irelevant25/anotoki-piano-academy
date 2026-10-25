import { TestBed } from '@angular/core/testing';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ThemeService } from '@anotoki/lib/shell';
import { SiteSettings } from '@anotoki/lib/site-settings';
import { startApp } from './app.config';
import { ChangelogService } from './shared/changelog/changelog.service';
import { BootService } from './shared/state/boot.service';

/** A promise the spec settles by hand, and whether it was asked for. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

/**
 * The app's start (app.config.ts' initializer, before the router's first navigation): where the site stands and the
 * site settings asked side by side - both before the start, so Page access's guard decides the first page with the
 * settings in hand, and the start knows whether the site is ready (or closed) before it asks for anybody's progress.
 */
describe("the app's start (startApp, app.config.ts)", () => {
  it('asks where the site stands and its settings together, and starts once both have answered - not before', async () => {
    const order: string[] = [];
    const status = deferred();
    const settings = deferred();
    TestBed.configureTestingModule({
      providers: [
        { provide: ThemeService, useValue: {} },
        { provide: ChangelogService, useValue: { load: () => Promise.resolve() } },
        { provide: SiteStatus, useValue: { check: () => (order.push('site status'), status.promise) } },
        { provide: SiteSettings, useValue: { load: () => (order.push('site settings'), settings.promise) } },
        { provide: BootService, useValue: { start: () => (order.push('start'), Promise.resolve()) } },
      ],
    });
    const started = TestBed.runInInjectionContext(() => startApp());
    await Promise.resolve();
    expect(order).toEqual(['site status', 'site settings']);
    status.resolve();
    await new Promise((done) => setTimeout(done));
    expect(order, 'the settings still on their way: no start').toEqual(['site status', 'site settings']);
    settings.resolve();
    await started;
    expect(order).toEqual(['site status', 'site settings', 'start']);
  });
});
