import { Session } from '../../core/music/music.types';
import { computeStreak, localDayKey, practiceMinutes } from './stats-page.component';

function session(startedAt: string, endedAt?: string): Session {
  return { id: startedAt, recordedAt: endedAt ?? startedAt, mode: 'trainer', startedAt, endedAt };
}

describe('Stats', () => {
  it('counts the streak in local days, and today does not break it before it is over', () => {
    const now = new Date(2026, 8, 28, 20, 0);
    const days = [27, 26, 25].map((day) => session(new Date(2026, 8, day, 9, 0).toISOString()));
    expect(computeStreak(days, now)).toBe(3);
    expect(computeStreak([session(new Date(2026, 8, 28, 8, 0).toISOString()), ...days], now)).toBe(4);
    expect(computeStreak([session(new Date(2026, 8, 20, 8, 0).toISOString())], now)).toBe(0);
    expect(computeStreak([], now)).toBe(0);
  });

  it('keys a day by the local calendar', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-1-5');
  });

  it('adds up the minutes practiced, leaving out odd gaps', () => {
    expect(
      practiceMinutes([
        session('2026-09-28T08:00:00.000Z', '2026-09-28T08:10:00.000Z'),
        session('2026-09-28T09:00:00.000Z', '2026-09-28T09:05:00.000Z'),
        session('2026-09-28T10:00:00.000Z', '2026-09-28T13:00:00.000Z'),
        session('2026-09-28T11:00:00.000Z'),
      ]),
    ).toBe(15);
  });
});
