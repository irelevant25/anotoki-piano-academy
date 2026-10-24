import { TestBed } from '@angular/core/testing';
import { NoteState, ProgressMap } from './music.types';
import { SrsService } from './srs.service';
import { TheoryService } from './theory.service';

describe('SrsService', () => {
  let srs: SrsService;
  let curriculum: readonly number[];

  beforeEach(() => {
    srs = TestBed.inject(SrsService);
    curriculum = TestBed.inject(TheoryService).curriculum;
  });

  const at = (text: string): Date => new Date(text);

  it('grades pitch first, then timing against the tolerance', () => {
    expect(srs.gradeAttempt({ correct: false, timingErrorMs: 0 })).toBe(1);
    expect(srs.gradeAttempt({ correct: true, timingErrorMs: null })).toBe(4);
    expect(srs.gradeAttempt({ correct: true, timingErrorMs: 50, timingToleranceMs: 250 })).toBe(5);
    expect(srs.gradeAttempt({ correct: true, timingErrorMs: -200, timingToleranceMs: 250 })).toBe(4);
    expect(srs.gradeAttempt({ correct: true, timingErrorMs: 400, timingToleranceMs: 250 })).toBe(3);
    expect(srs.gradeAttempt({ correct: true, timingErrorMs: 900, timingToleranceMs: 250 })).toBe(2);
  });

  it('takes two learning steps in one sitting, then grows at most once a local day', () => {
    let note = srs.createInitialNoteState(60);
    note = srs.updateNoteState(note, 4, null, at('2026-09-20T09:00:00'));
    expect([note.status, note.repetitions, note.intervalHours]).toEqual(['learning', 1, 4]);
    note = srs.updateNoteState(note, 4, null, at('2026-09-20T09:01:00'));
    expect([note.status, note.repetitions, note.intervalHours]).toEqual(['review', 2, 24]);

    // Twenty more presses the same day: counted, but the schedule stays.
    for (let i = 0; i < 20; i++) note = srs.updateNoteState(note, 5, null, at('2026-09-20T09:05:00'));
    expect([note.repetitions, note.intervalHours, note.totalAttempts, note.correctAttempts]).toEqual([2, 24, 22, 22]);

    // The next day it grows again.
    note = srs.updateNoteState(note, 5, null, at('2026-09-21T09:00:00'));
    expect(note.repetitions).toBe(3);
    expect(note.intervalHours).toBeGreaterThan(24);
  });

  it('is mastered after a few days of daily practice - and a miss always lapses', () => {
    let note = srs.createInitialNoteState(64);
    let day = 20;
    note = srs.updateNoteState(note, 5, null, at(`2026-09-${day}T09:00:00`));
    note = srs.updateNoteState(note, 5, null, at(`2026-09-${day}T09:01:00`));
    while (note.status !== 'mastered' && day < 30) {
      day += 1;
      note = srs.updateNoteState(note, 5, null, at(`2026-09-${day}T09:00:00`));
    }
    expect(note.status).toBe('mastered');
    expect(day - 20).toBeLessThanOrEqual(6);

    const lapsed = srs.updateNoteState(note, 1, null, at('2026-10-05T09:00:00'));
    expect([lapsed.status, lapsed.repetitions, lapsed.intervalHours]).toEqual(['review', 0, 1]);
  });

  it('keeps the ease factor and the interval inside their bounds', () => {
    let note: NoteState = { ...srs.createInitialNoteState(67), repetitions: 50, intervalHours: 24 * 170, easeFactor: 3.5, status: 'mastered', lastGrowthAt: null };
    const start = at('2026-01-01T09:00:00').getTime();
    for (let day = 0; day < 40; day++) note = srs.updateNoteState(note, 5, null, new Date(start + day * 86_400_000));
    expect(note.easeFactor).toBeLessThanOrEqual(3.5);
    expect(note.intervalHours).toBeLessThanOrEqual(24 * 180);
    expect(() => new Date(note.dueAt as string).toISOString()).not.toThrow();
  });

  it('averages the timing error', () => {
    let note = srs.updateNoteState(srs.createInitialNoteState(60), 5, -100);
    expect(note.avgTimingErrorMs).toBe(100);
    note = srs.updateNoteState(note, 5, 200);
    expect(note.avgTimingErrorMs).toBeCloseTo(120);
  });

  it('repairs progress saved before the once-a-day rule, once', () => {
    const inflated = {
      midi: 60,
      status: 'mastered',
      repetitions: 6,
      easeFactor: 2.5,
      intervalHours: 938,
      dueAt: '2026-10-18T16:08:49.446Z',
      lastGrade: 4,
      totalAttempts: 22,
      correctAttempts: 17,
      avgTimingErrorMs: null,
      updatedAt: '2026-09-09T14:08:49.446Z',
    } as unknown as NoteState;
    const fresh: NoteState = { ...srs.createInitialNoteState(62), status: 'learning', repetitions: 1, lastGrowthAt: '2026-09-09T14:00:00.000Z' };
    const repaired = srs.repairInflatedProgress({ 60: inflated, 62: fresh });
    expect(repaired['60']).toMatchObject({ status: 'review', repetitions: 2, intervalHours: 24, dueAt: '2026-09-10T14:08:49.446Z', lastGrowthAt: '2026-09-09T14:08:49.446Z', totalAttempts: 22 });
    expect(repaired['62']).toBe(fresh);
    expect(srs.repairInflatedProgress(repaired)).toEqual(repaired);
  });

  it('knows which notes are known and which are due - mastered ones included', () => {
    const now = at('2026-09-20T12:00:00').getTime();
    const progress: ProgressMap = {
      60: { ...srs.createInitialNoteState(60), status: 'review', dueAt: '2026-09-19T00:00:00.000Z' },
      62: { ...srs.createInitialNoteState(62), status: 'mastered', dueAt: '2026-09-19T00:00:00.000Z' },
      64: { ...srs.createInitialNoteState(64), status: 'learning', dueAt: '2026-09-25T00:00:00.000Z' },
    };
    expect(srs.getKnownNotes(progress, curriculum)).toEqual([60, 62]);
    expect(srs.countDueNotes(progress, curriculum, now)).toBe(2);
  });

  it('starts a new learner on the first note, and holds new notes back while others are being learned', () => {
    expect(srs.pickPracticeQueue({}, curriculum)).toEqual([60]);
    const busy: ProgressMap = {};
    for (const midi of [60, 62, 64]) busy[midi] = { ...srs.createInitialNoteState(midi), status: 'learning', dueAt: '2099-01-01T00:00:00.000Z' };
    expect(srs.pickPracticeQueue(busy, curriculum, { maxActiveNew: 3 })).toEqual([60, 62, 64]);
    // A note that reached "review" no longer counts against the cap.
    busy[60] = { ...busy[60], status: 'review' };
    expect(srs.pickPracticeQueue(busy, curriculum, { maxActiveNew: 3 })).toContain(67);
  });
});
