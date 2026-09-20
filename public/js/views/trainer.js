import { midiToName } from '/shared/theory.js';
import { pickPracticeQueue, gradeAttempt, updateNoteState } from '/shared/srs.js';
import { PianoKeyboard } from '../keyboard.js';
import { Notation } from '../notation.js';

const ROUND_LENGTH = 12;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(queue, length) {
  const seq = [];
  while (seq.length < length) seq.push(...shuffle(queue));
  return seq.slice(0, length);
}

export function renderTrainer(container, ctx) {
  const progress = { ...ctx.getState().progress };
  const queue = pickPracticeQueue(progress, ctx.curriculum, { count: 8 });
  const round = buildRound(queue, ROUND_LENGTH);

  let index = 0;
  let awaitingAnswer = true;
  let correctCount = 0;
  let timer = null;
  const startedAt = new Date().toISOString();

  container.innerHTML = `
    <div class="card">
      <h2>Note Trainer</h2>
      <p class="tag">Prompt <span id="tr-progress">1 / ${ROUND_LENGTH}</span> &middot; <span id="tr-correct">0</span> correct so far</p>
      <div id="tr-notation" class="notation-container"></div>
      <p class="prompt" id="tr-name"></p>
      <p class="feedback" id="tr-feedback">Play the note shown above on your piano.</p>
      <div id="tr-keyboard"></div>
    </div>
  `;

  const notation = new Notation(container.querySelector('#tr-notation'));
  const keyboard = new PianoKeyboard(container.querySelector('#tr-keyboard'), { lowMidi: 41, highMidi: 79 });
  keyboard.markKnown(ctx.getKnownNotes());

  const progressEl = container.querySelector('#tr-progress');
  const nameEl = container.querySelector('#tr-name');
  const feedbackEl = container.querySelector('#tr-feedback');

  function showPrompt() {
    const target = round[index];
    progressEl.textContent = `${index + 1} / ${ROUND_LENGTH}`;
    nameEl.textContent = midiToName(target);
    feedbackEl.textContent = 'Play this note on your piano.';
    feedbackEl.className = 'feedback';
    keyboard.clearStates();
    notation.renderSingleNote(target);
    awaitingAnswer = true;
  }

  async function finishRound() {
    awaitingAnswer = false;
    const accuracy = Math.round((correctCount / ROUND_LENGTH) * 100);
    container.innerHTML = `
      <div class="card">
        <h2>Round complete</h2>
        <div class="grid">
          <div class="stat-tile"><div class="value">${correctCount}/${ROUND_LENGTH}</div><div class="label">Correct</div></div>
          <div class="stat-tile"><div class="value">${accuracy}%</div><div class="label">Accuracy</div></div>
        </div>
        <div class="controls-row" style="margin-top:1rem;">
          <button id="tr-again" type="button">Practice again</button>
          <button id="tr-stats" type="button">View stats</button>
        </div>
      </div>
    `;
    container.querySelector('#tr-again').addEventListener('click', () => ctx.navigateTo('trainer'));
    container.querySelector('#tr-stats').addEventListener('click', () => ctx.navigateTo('stats'));

    try {
      await ctx.recordSession({
        mode: 'trainer',
        startedAt,
        endedAt: new Date().toISOString(),
        attempts: ROUND_LENGTH,
        correct: correctCount,
        accuracy,
      });
    } catch (err) {
      console.error('Failed to record session', err);
    }
  }

  function onNoteOn(e) {
    if (!awaitingAnswer) return;
    awaitingAnswer = false;

    const played = e.detail.midi;
    const target = round[index];
    const correct = played === target;
    const grade = gradeAttempt({ correct, timingErrorMs: null });

    progress[target] = updateNoteState(progress[target] || ctx.getNoteState(target), grade, null);

    keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    if (!correct) keyboard.setKeyState(target, 'target');

    if (correct) {
      correctCount += 1;
      container.querySelector('#tr-correct').textContent = String(correctCount);
      feedbackEl.textContent = 'Correct!';
      feedbackEl.className = 'feedback feedback--correct';
    } else {
      feedbackEl.textContent = `That was ${midiToName(played)} — target was ${midiToName(target)}.`;
      feedbackEl.className = 'feedback feedback--incorrect';
    }

    ctx.saveProgress(progress).catch((err) => console.error('Failed to save progress', err));

    index += 1;
    timer = setTimeout(() => {
      if (index >= ROUND_LENGTH) finishRound();
      else showPrompt();
    }, 700);
  }

  ctx.midi.addEventListener('noteon', onNoteOn);
  showPrompt();

  // The timer must go too: `container` is the app's view root, so a late
  // finishRound() would draw "Round complete" over whatever view came next.
  return () => {
    clearTimeout(timer);
    ctx.midi.removeEventListener('noteon', onNoteOn);
  };
}
