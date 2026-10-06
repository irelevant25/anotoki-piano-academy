import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiService, Person } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ProgressStore } from '../../../core/state/progress-store.service';
import { provideTestDialog } from '../../../core/testing/test-dialog';
import { PeopleComponent } from './people.component';

const MIA: Person = { id: 7, username: 'mia', firstSeen: '2026-10-01T10:00:00.000Z', lastSeen: '2026-10-04T10:00:00.000Z', notes: 12, steps: 4, sessions: 30 };
const ME: Person = { id: 1, username: 'owner', firstSeen: '2026-09-28T10:00:00.000Z', lastSeen: '2026-10-04T11:00:00.000Z', notes: 0, steps: 0, sessions: 0 };
const NAMELESS: Person = { id: 9, username: null, firstSeen: '2026-09-29T10:00:00.000Z', lastSeen: '2026-09-29T10:00:00.000Z', notes: 1, steps: 0, sessions: 0 };

describe('PeopleComponent (ADMIN): everybody the app keeps anything of, and deleting a person after a question', () => {
  let fixture: ComponentFixture<PeopleComponent>;
  let host: HTMLElement;
  const api = { people: vi.fn(), deletePerson: vi.fn(), dataOwner: () => '1' };
  const store = { announceReplaced: vi.fn(), reloadFromServer: vi.fn(async () => undefined), changedElsewhere: { set: vi.fn() } };

  beforeAll(() => provideTestDialog());

  beforeEach(async () => {
    api.people.mockReset().mockResolvedValue({ people: [ME, MIA, NAMELESS], visitors: { count: 3, sessions: 41 } });
    api.deletePerson.mockReset().mockResolvedValue(undefined);
    store.announceReplaced.mockClear();
    store.reloadFromServer.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }, { provide: ProgressStore, useValue: store }] });
    fixture = TestBed.createComponent(PeopleComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  const flush = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  };
  const rows = (): string[][] =>
    Array.from(host.querySelectorAll('#people-table tbody tr[data-person]')).map((row) => Array.from(row.querySelectorAll('td')).slice(0, 7).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? ''));
  const dialog = (): HTMLDialogElement => host.querySelector('dialog.confirm')!;
  const remove = async (id: number): Promise<void> => {
    (host.querySelector(`tr[data-person="${id}"] button.delete`) as HTMLButtonElement).click();
    await flush();
  };
  const answer = async (yes: boolean): Promise<void> => {
    (dialog().querySelector(`[data-answer="${yes ? 'yes' : 'no'}"]`) as HTMLButtonElement).click();
    await flush();
  };

  it('lists everybody with their counts, English, the signed-in person marked', () => {
    expect(host.querySelector('section')?.getAttribute('lang')).toBe('en');
    expect(rows().map((row) => [row[0], row[1], row[4], row[5], row[6]])).toEqual([
      ['owner you', '1', '0', '0', '0'],
      ['mia', '7', '12', '4', '30'],
      ['(no username)', '9', '1', '0', '0'],
    ]);
  });

  it('counts the visitors in a line under the list - never listed, never a row to delete', async () => {
    const line = (): string => host.querySelector('#people-visitors')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    expect(line()).toBe('3 visitors - people practising without signing in - with 41 rounds. A visitor is deleted 30 days after their last visit.');
    expect(rows()).toHaveLength(3);

    for (const [visitors, said] of [
      [{ count: 1, sessions: 1 }, '1 visitor - people practising without signing in - with 1 round. A visitor is deleted 30 days after their last visit.'],
      [{ count: 0, sessions: 0 }, 'No visitors: nobody is practising without signing in.'],
    ] as const) {
      api.people.mockResolvedValueOnce({ people: [ME], visitors });
      await (fixture.componentInstance as PeopleComponent).load();
      await flush();
      expect(line()).toBe(said);
    }

    // Not loaded: no line either.
    api.people.mockRejectedValueOnce(new ApiError('no', 500, 'server', false, { error: 'The server failed.', code: 'server' }));
    await (fixture.componentInstance as PeopleComponent).load();
    await flush();
    expect(host.querySelector('#people-visitors')).toBeNull();
  });

  it('deletes nobody without a yes - and names the person and the counts in the question', async () => {
    await remove(7);
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(dialog().querySelector('h2')?.textContent).toBe('Delete the progress of mia?');
    expect(dialog().querySelector('p')?.textContent).toContain('12 notes, 4 steps of the path and 30 rounds');
    await answer(false);
    expect(api.deletePerson).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);

    await remove(7);
    await answer(true);
    expect(api.deletePerson).toHaveBeenCalledWith(7);
    expect(rows().map((row) => row[1])).toEqual(['1', '9']);
    expect(host.querySelector('#people-done')?.textContent).toBe('The progress of mia was deleted.');
    // Somebody else: this tab's own progress is not touched.
    expect(store.reloadFromServer).not.toHaveBeenCalled();
  });

  it('deleting oneself loads one’s own (empty) progress at once, and tells one’s other tabs', async () => {
    await remove(1);
    await answer(true);
    expect(api.deletePerson).toHaveBeenCalledWith(1);
    expect(store.announceReplaced).toHaveBeenCalledTimes(1);
    expect(store.reloadFromServer).toHaveBeenCalledTimes(1);
  });

  it('a person gone already (404) leaves the list; another refusal is said on their row in the server’s words', async () => {
    api.deletePerson.mockRejectedValueOnce(new ApiError('gone', 404, 'not_found', false, { error: 'There is nobody with that id here.', code: 'not_found' }));
    await remove(9);
    await answer(true);
    expect(rows().map((row) => row[1])).toEqual(['1', '7']);
    expect(host.querySelector('#people-done')?.textContent).toContain('was not there any more');

    api.deletePerson.mockRejectedValueOnce(new ApiError('no', 403, 'forbidden', false, { error: 'Only an administrator of Piano Academy may do this.', code: 'forbidden' }));
    await remove(7);
    await answer(true);
    expect(host.querySelector('.row-problem td')?.textContent).toBe('Only an administrator of Piano Academy may do this.');
    expect(rows()).toHaveLength(2);
  });

  it('writes when each was first and last seen as numbers, here - or in the order and on the clock the reader’s anotoki account chose', async () => {
    const seen = (): string[] => Array.from(host.querySelectorAll('tr[data-person="7"] td')).slice(2, 4).map((cell) => cell.textContent?.trim() ?? '');
    const pad = (value: number): string => String(value).padStart(2, '0');
    const first = new Date(MIA.firstSeen);
    const last = new Date(MIA.lastSeen);
    // As the date pipe wrote it before (yyyy-MM-dd HH:mm), in the reader's time zone.
    const stamp = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    expect(seen()).toEqual([stamp(first), stamp(last)]);

    const auth = TestBed.inject(AuthService);
    (auth as unknown as { authenticated: WritableSignal<boolean> }).authenticated.set(true);
    auth.user.set({ sub: '1', preferred_username: 'owner', email: null, email_verified: true, locale: 'en', roles: ['MEMBER', 'ADMIN'], preferences: { theme: 'auto', date_format: 'dmy_dot', time_format: '12' } });
    await fixture.whenStable();
    const clock = (date: Date): string => new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }).format(date);
    expect(seen()).toEqual([`${first.getDate()}.${first.getMonth() + 1}.${first.getFullYear()} ${clock(first)}`, `${last.getDate()}.${last.getMonth() + 1}.${last.getFullYear()} ${clock(last)}`]);
  });
});
