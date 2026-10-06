import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiService, MigrationsStatus } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BootService } from '../../../core/state/boot.service';
import { provideTestDialog } from '../../../core/testing/test-dialog';
import { MigrationsComponent } from './migrations.component';

const BEHIND: MigrationsStatus = {
  database: 'anotoki_piano',
  applied: [
    { name: '001_init.sql', applied_at: '2026-09-28 10:00' },
    { name: '002_languages_and_translations.sql', applied_at: '2026-09-30 18:12' },
  ],
  pending: [{ name: '003_site_strings.sql' }, { name: '004_family_shell.sql' }],
};
const CURRENT: MigrationsStatus = {
  database: 'anotoki_piano',
  applied: [...BEHIND.applied, { name: '003_site_strings.sql', applied_at: '2026-10-04 09:30' }, { name: '004_family_shell.sql', applied_at: '2026-10-04 09:30' }],
  pending: [],
};

describe('MigrationsComponent (ADMIN): what the database has and lacks, and applying it - the IAM’s page', () => {
  let fixture: ComponentFixture<MigrationsComponent>;
  let host: HTMLElement;
  const api = { migrations: vi.fn(), applyMigrations: vi.fn() };
  const boot = { resumeAfterUpdate: vi.fn(async () => undefined) };

  beforeAll(() => provideTestDialog());

  beforeEach(async () => {
    api.migrations.mockReset().mockResolvedValue(BEHIND);
    api.applyMigrations.mockReset();
    boot.resumeAfterUpdate.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }, { provide: BootService, useValue: boot }] });
    fixture = TestBed.createComponent(MigrationsComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  const flush = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  };
  const text = (selector: string): string | null => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  /** Each element's children's words, a space between them (the template has none between elements). */
  const texts = (selector: string): string[] =>
    Array.from(host.querySelectorAll(selector)).map((node) =>
      Array.from(node.children)
        .map((child) => child.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .join(' '),
    );
  const button = (): HTMLButtonElement => host.querySelector('#migrations-apply') as HTMLButtonElement;
  const dialog = (): HTMLDialogElement => host.querySelector('dialog.confirm')!;
  const apply = async (yes = true): Promise<void> => {
    button().click();
    await flush();
    (dialog().querySelector(`[data-answer="${yes ? 'yes' : 'no'}"]`) as HTMLButtonElement).click();
    await flush();
    await flush();
  };

  it('shows Pending in the order they will run and Applied with when - in English', () => {
    expect(host.querySelector('section')?.getAttribute('lang')).toBe('en');
    expect(text('h2')).toBe('Migrations');
    expect(text('.lead')).toBe('The database schema is what these files build. Back the database up before applying anything (pg_dump).');
    expect(text('#migrations-database')).toBe('anotoki_piano');
    expect(texts('#migrations-pending li')).toEqual(['003_site_strings.sql pending', '004_family_shell.sql pending']);
    expect(text('#migrations-pending .sub')).toBe('In the order they will run.');
    expect(texts('#migrations-applied li')).toEqual(['001_init.sql 2026-09-28 10:00', '002_languages_and_translations.sql 2026-09-30 18:12']);
    expect(text('#migrations-applied .sub')).toBe('2 files');
    expect(button().disabled).toBe(false);
    expect(text('#migrations-apply')).toBe('Apply pending');
  });

  it('writes when each ran in the order and on the clock the reader’s anotoki account chose - the server’s own numbers, never moved to another time zone', async () => {
    const auth = TestBed.inject(AuthService);
    (auth as unknown as { authenticated: WritableSignal<boolean> }).authenticated.set(true);
    auth.user.set({ sub: '1', preferred_username: 'owner', email: null, email_verified: true, locale: 'en', roles: ['MEMBER', 'ADMIN'], preferences: { theme: 'dark', date_format: 'mdy_slash', time_format: '12' } });
    await fixture.whenStable();
    expect(texts('#migrations-applied li')).toEqual(['001_init.sql 09/28/2026 10:00 am', '002_languages_and_translations.sql 09/30/2026 6:12 pm']);

    // An account that left both automatic: as the server wrote it.
    auth.user.set({ sub: '1', preferred_username: 'owner', email: null, email_verified: true, locale: 'en', roles: ['MEMBER', 'ADMIN'], preferences: { theme: 'dark', date_format: null, time_format: null } });
    await fixture.whenStable();
    expect(texts('#migrations-applied li')).toEqual(['001_init.sql 2026-09-28 10:00', '002_languages_and_translations.sql 2026-09-30 18:12']);
  });

  it('asks first - a no applies nothing', async () => {
    await apply(false);
    expect(dialog().querySelector('h2')?.textContent).toBe('Apply 2 pending migrations?');
    expect(dialog().querySelector('p')?.textContent).toContain('Make sure there is a fresh backup');
    expect(api.applyMigrations).not.toHaveBeenCalled();
    expect(host.querySelector('#migrations-result')).toBeNull();
  });

  it('applies on a yes, says "Up to date", looks again - and starts the app where it stands', async () => {
    api.applyMigrations.mockResolvedValue({ applied: ['003_site_strings.sql', '004_family_shell.sql'], failed: null, error: null });
    api.migrations.mockResolvedValue(CURRENT);
    await apply();
    expect(api.applyMigrations).toHaveBeenCalledTimes(1);
    expect(texts('#migrations-result')).toEqual(['Up to date Applied: 003_site_strings.sql, 004_family_shell.sql.']);
    expect(host.querySelector('#migrations-result')?.getAttribute('role')).toBe('status');
    expect(texts('#migrations-pending')).toEqual(['Pending Nothing pending - the database is up to date with the files.']);
    expect(text('#migrations-applied .sub')).toBe('4 files');
    expect(button().disabled).toBe(true);
    expect(boot.resumeAfterUpdate).toHaveBeenCalledTimes(1);
  });

  it('names the file it stopped at, what ran before it, that it was rolled back whole, and what PostgreSQL said', async () => {
    const said = 'statement 3 of 9: SQLSTATE[42701]: Duplicate column: 7 ERROR:  column "time_zone" of relation "users" already exists\n\n  ALTER TABLE users ADD COLUMN time_zone TEXT';
    api.applyMigrations.mockResolvedValue({ applied: ['003_site_strings.sql'], failed: '004_family_shell.sql', error: said });
    api.migrations.mockResolvedValue({ ...BEHIND, applied: [...BEHIND.applied, { name: '003_site_strings.sql', applied_at: '2026-10-04 09:30' }], pending: [{ name: '004_family_shell.sql' }] });
    await apply();
    expect(host.querySelector('#migrations-result')?.getAttribute('role')).toBe('alert');
    expect(text('#migrations-result .alert-head')).toBe('Stopped at 004_family_shell.sql');
    expect(text('#migrations-result')).toContain('Applied first: 003_site_strings.sql. The failed file was rolled back as a whole.');
    // Word for word, its lines kept - in a box of its own, as on the IAM's page.
    expect(host.querySelector('#migrations-result pre.error code')?.textContent).toBe(said);
    expect(texts('#migrations-pending li')).toEqual(['004_family_shell.sql pending']);
    expect(boot.resumeAfterUpdate).not.toHaveBeenCalled();
  });

  it('says when another update runs - nothing applied', async () => {
    api.applyMigrations.mockRejectedValue(new ApiError('busy', 409, 'busy', false, { error: 'Another database update is running. Wait a moment, then look again.', code: 'busy' }));
    await apply();
    expect(text('#migrations-refused')).toBe('Another database update is running (another Apply, setup.php or php migration.php). Nothing was applied. Wait a moment, then look again.');
    expect(host.querySelector('#migrations-result')).toBeNull();
  });

  it('nothing pending: the button is off, and an Apply that found nothing says so', async () => {
    api.migrations.mockResolvedValue(CURRENT);
    await fixture.componentInstance.load();
    await fixture.whenStable();
    expect(button().disabled).toBe(true);

    // Somebody else applied them a moment ago (the page still showed them pending).
    api.migrations.mockResolvedValueOnce(BEHIND).mockResolvedValue(CURRENT);
    await fixture.componentInstance.load();
    await fixture.whenStable();
    api.applyMigrations.mockResolvedValue({ applied: [], failed: null, error: null });
    await apply();
    expect(text('#migrations-result')).toBe('There was nothing to apply.');
  });

  it('a list that could not be read says so, with Try again', async () => {
    api.migrations.mockRejectedValue(new ApiError('down', 0, null, false));
    await fixture.componentInstance.load();
    await fixture.whenStable();
    expect(text('.problem strong')).toBe('The migrations could not be read.');
  });
});
