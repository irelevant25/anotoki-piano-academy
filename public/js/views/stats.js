import { midiToName } from '/shared/theory.js';
import { PianoKeyboard } from '../keyboard.js';

/** Calendar day in the learner's own time zone (timestamps are stored in UTC). */
function localDayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function computeStreak(sessions) {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => localDayKey(new Date(s.startedAt || s.recordedAt))));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // If today has no session yet, start counting from yesterday so an
  // in-progress streak doesn't read as broken before today's practice.
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (;;) {
    const key = localDayKey(cursor);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function practiceMinutes(sessions) {
  let ms = 0;
  for (const s of sessions) {
    if (s.startedAt && s.endedAt) {
      const d = new Date(s.endedAt) - new Date(s.startedAt);
      if (d > 0 && d < 3600_000) ms += d; // ignore bogus/huge gaps
    }
  }
  return Math.round(ms / 60000);
}

export function renderStats(container, ctx) {
  const { progress, sessions } = ctx.getState();
  const curriculum = ctx.curriculum;

  const attempted = curriculum.map((m) => progress[m]).filter((s) => s && s.totalAttempts > 0);
  const totalAttempts = attempted.reduce((sum, s) => sum + s.totalAttempts, 0);
  const totalCorrect = attempted.reduce((sum, s) => sum + s.correctAttempts, 0);
  const overallAccuracy = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : null;

  const masteredCount = curriculum.filter((m) => progress[m]?.status === 'mastered').length;
  const knownCount = ctx.getKnownNotes().length;
  const streak = computeStreak(sessions);
  const minutes = practiceMinutes(sessions);

  const recentSessions = [...sessions].reverse().slice(0, 15);
  const sessionRows = recentSessions.map((s) => {
    const date = new Date(s.startedAt || s.recordedAt).toLocaleString();
    const label = s.mode === 'lesson' ? `Lesson: ${s.label}`
      : s.mode === 'song' ? `Song: ${s.songTitle}`
        : s.mode === 'sheet' ? 'Sheet Practice' : 'Note Trainer';
    const timing = s.avgTimingErrorMs != null ? `${s.avgTimingErrorMs}ms` : '—';
    return `<tr><td>${date}</td><td>${label}</td><td>${s.correct}/${s.attempts}</td><td>${s.accuracy}%</td><td>${timing}</td></tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <h2>Your Progress</h2>
      <div class="grid">
        <div class="stat-tile"><div class="value">${knownCount}/${curriculum.length}</div><div class="label">Notes known</div></div>
        <div class="stat-tile"><div class="value">${masteredCount}</div><div class="label">Notes mastered</div></div>
        <div class="stat-tile"><div class="value">${overallAccuracy !== null ? overallAccuracy + '%' : '—'}</div><div class="label">Overall accuracy</div></div>
        <div class="stat-tile"><div class="value">${streak}</div><div class="label">Day streak</div></div>
        <div class="stat-tile"><div class="value">${sessions.length}</div><div class="label">Sessions logged</div></div>
        <div class="stat-tile"><div class="value">${minutes}</div><div class="label">Minutes practiced</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Keyboard mastery</h2>
      <p class="tag">
        <span style="color:var(--warn)">&#9679;</span> learning &nbsp;
        <span style="color:#7fb3ff">&#9679;</span> review &nbsp;
        <span style="color:var(--good)">&#9679;</span> mastered
      </p>
      <div id="st-keyboard"></div>
    </div>

    <div class="card">
      <h2>Recent sessions</h2>
      ${sessions.length === 0 ? '<p>No sessions yet — practice a round in Note Trainer to get started.</p>' : `
        <table>
          <thead><tr><th>When</th><th>Mode</th><th>Score</th><th>Accuracy</th><th>Avg timing</th></tr></thead>
          <tbody>${sessionRows}</tbody>
        </table>
      `}
    </div>
  `;

  const keyboard = new PianoKeyboard(container.querySelector('#st-keyboard'), { lowMidi: 41, highMidi: 84 });
  for (const midi of curriculum) {
    const s = progress[midi];
    keyboard.setKeyLevel(midi, s ? s.status : 'new');
  }

  return () => {};
}
