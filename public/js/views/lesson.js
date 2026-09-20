// Runs one learning-path step (see shared/path.js), then shows the result:
// pass (best accuracy >= PASS_ACCURACY) unlocks the next step, otherwise the
// learner retries. Each step type has its own renderer below; all of them
// call `done({ accuracy, session, delayMs })` the moment the attempt ends and
// return a destroy() that removes their MIDI listeners. The result is saved
// at once; `delayMs` only holds back the result screen so the learner can see
// the feedback for the last note.

import { midiToName } from '/shared/theory.js';
import { gradeAttempt, updateNoteState } from '/shared/srs.js';
import {
  PASS_ACCURACY, STEP_TYPES, NOTE_HINTS, findStep, getStepAfter, getStepRecord, isStepPassed, isStepUnlocked,
  recordStepResult, notePoolForUnit, buildDrillRound, generateMelody, songForStep, stepKey,
} from '/shared/path.js';
import { PianoKeyboard } from '../keyboard.js';
import { Notation } from '../notation.js';
import { SequencePlayer, sessionFieldsFromResult } from '../sequence-player.js';

const MEET_REPETITIONS = 3;
const DRILL_LENGTH = 10;
const MELODY_LENGTH = 8;

export function renderLesson(container, ctx, { unitId, stepId } = {}) {
  const entry = findStep(unitId, stepId);
  if (!entry || !isStepUnlocked(ctx.getPathProgress(), entry.key)) {
    container.innerHTML = `
      <div class="card">
        <h2>This step is locked</h2>
        <p>Finish the earlier steps on the path first.</p>
        <button class="btn-primary" id="ls-path" type="button">Back to the path</button>
      </div>
    `;
    container.querySelector('#ls-path').addEventListener('click', () => ctx.navigateTo('home'));
    return () => {};
  }

  const { phase, unit, step } = entry;
  // Teardown for whatever is currently mounted in the lesson body (a step
  // renderer while playing, nothing on the result screen).
  let destroyBody = () => {};

  container.innerHTML = `
    <div class="card lesson">
      <div class="lesson-head">
        <button id="ls-back" type="button">&larr; Path</button>
        <div class="lesson-title">
          <div class="tag">${phase.title} · Unit ${unit.number}</div>
          <h2>${unit.title} — ${STEP_TYPES[step.type].title}</h2>
        </div>
      </div>
      <ol class="step-dots">
        ${unit.steps.map((s) => {
          const key = stepKey(unit.id, s.id);
          const cls = s.id === step.id ? 'is-current' : isStepPassed(ctx.getPathProgress(), key) ? 'is-passed' : '';
          return `<li class="${cls}">${STEP_TYPES[s.type].short}</li>`;
        }).join('')}
      </ol>
      <div id="ls-body"></div>
    </div>
  `;
  container.querySelector('#ls-back').addEventListener('click', () => ctx.navigateTo('home'));
  const body = container.querySelector('#ls-body');

  function start() {
    destroyBody();
    body.replaceChildren();
    destroyBody = STEP_RENDERERS[step.type](body, ctx, entry, finish);
  }

  function finish({ accuracy, session, delayMs = 0 }) {
    destroyBody();
    const wasPassed = isStepPassed(ctx.getPathProgress(), entry.key);
    const updated = recordStepResult(ctx.getPathProgress(), entry.key, accuracy);
    ctx.savePathProgress(updated).catch((err) => console.error('Failed to save path progress', err));
    if (session) {
      ctx.recordSession({ mode: 'lesson', label: `${unit.title} · ${STEP_TYPES[step.type].short}`, unitId: unit.id, stepId: step.id, ...session })
        .catch((err) => console.error('Failed to record session', err));
    }
    const timer = setTimeout(() => renderResult(accuracy, wasPassed, getStepRecord(updated, entry.key)), delayMs);
    destroyBody = () => clearTimeout(timer);
  }

  function renderResult(accuracy, wasPassed, record) {
    const passedNow = accuracy >= PASS_ACCURACY;
    const open = passedNow || wasPassed;
    const next = getStepAfter(entry.key);
    const finishesUnit = open && (!next || next.unit.id !== unit.id);

    let message;
    if (step.type === 'meet') message = 'You met the new notes. Now let\'s see if you can find them without help.';
    else if (passedNow && finishesUnit) message = `Unit ${unit.number} complete! 🎉`;
    else if (passedNow) message = 'Step passed - nice work!';
    else if (wasPassed) message = `Not this time, but your best is ${record.bestAccuracy}%, so the path stays open.`;
    else message = `You need ${PASS_ACCURACY}% to continue. Give it another try - it gets easier every time.`;

    destroyBody = () => {};
    body.innerHTML = `
      <div class="lesson-result ${open ? 'is-pass' : 'is-fail'}">
        ${step.type === 'meet' ? '' : `<div class="result-score">${accuracy}%</div>`}
        <p class="result-message">${message}</p>
        ${open && !next ? '<p>That was the last unit for now - more are coming.</p>' : ''}
        <div class="controls-row result-actions">
          ${open && next ? `<button class="btn-primary btn-large" id="ls-next" type="button">${next.unit.id === unit.id ? 'Continue' : 'Next unit'}</button>` : ''}
          <button class="${open ? '' : 'btn-primary btn-large'}" id="ls-retry" type="button">${open ? 'Practice again' : 'Try again'}</button>
          <button id="ls-path" type="button">Back to the path</button>
        </div>
      </div>
    `;
    body.querySelector('#ls-next')?.addEventListener('click', () => ctx.navigateTo('lesson', { unitId: next.unit.id, stepId: next.step.id }));
    body.querySelector('#ls-retry').addEventListener('click', start);
    body.querySelector('#ls-path').addEventListener('click', () => ctx.navigateTo('home'));
  }

  start();
  return () => destroyBody();
}

const STEP_RENDERERS = { meet: renderMeet, drill: renderDrill, read: renderRead, tempo: renderTempo, song: renderSong };

function keyboardFor(el, phase, pool) {
  const keyboard = new PianoKeyboard(el, phase.keyboard);
  keyboard.markKnown(pool);
  return keyboard;
}

function setFeedback(el, text, kind = null) {
  el.textContent = text;
  el.className = kind ? `feedback feedback--${kind}` : 'feedback';
}

/** Meet: each new note is shown on the staff and highlighted on the keyboard; play it a few times. */
function renderMeet(body, ctx, { phase, unit }, done) {
  let noteIndex = 0;
  let reps = 0;
  let waiting = true;
  let timer = null;

  body.innerHTML = `
    <p class="lesson-instruction">Here ${unit.newNotes.length === 1 ? 'is your new note' : 'are your new notes'}.
      Find the blue key and play it ${MEET_REPETITIONS} times.</p>
    <div class="meet-layout">
      <div id="mt-notation" class="notation-container"></div>
      <div>
        <p class="prompt" id="mt-name"></p>
        <p class="tag" id="mt-hint"></p>
        <p class="rep-dots" id="mt-reps"></p>
      </div>
    </div>
    <p class="feedback" id="mt-feedback"></p>
    <div id="mt-keyboard"></div>
  `;
  const notation = new Notation(body.querySelector('#mt-notation'));
  const keyboard = keyboardFor(body.querySelector('#mt-keyboard'), phase, []);
  const feedbackEl = body.querySelector('#mt-feedback');

  function showNote() {
    const target = unit.newNotes[noteIndex];
    reps = 0;
    waiting = true;
    notation.renderSingleNote(target);
    body.querySelector('#mt-name').textContent = midiToName(target);
    body.querySelector('#mt-hint').textContent = NOTE_HINTS[target] || '';
    keyboard.clearStates();
    keyboard.setKeyState(target, 'target');
    renderReps();
    setFeedback(feedbackEl, unit.newNotes.length > 1 ? `Note ${noteIndex + 1} of ${unit.newNotes.length}` : '');
  }

  function renderReps() {
    body.querySelector('#mt-reps').textContent = '●'.repeat(reps) + '○'.repeat(MEET_REPETITIONS - reps);
  }

  function onNoteOn(e) {
    if (!waiting) return;
    const target = unit.newNotes[noteIndex];
    const played = e.detail.midi;
    if (played !== target) {
      keyboard.setKeyState(played, 'incorrect');
      setTimeout(() => keyboard.setKeyState(played, null), 400);
      setFeedback(feedbackEl, `That was ${midiToName(played)}. Play the blue key.`, 'incorrect');
      return;
    }
    reps += 1;
    renderReps();
    keyboard.setKeyState(target, 'correct');
    setTimeout(() => { if (waiting) keyboard.setKeyState(target, 'target'); }, 250);
    if (reps < MEET_REPETITIONS) {
      setFeedback(feedbackEl, 'Yes! Again.', 'correct');
      return;
    }
    waiting = false;
    setFeedback(feedbackEl, `That's ${midiToName(target)}!`, 'correct');
    noteIndex += 1;
    if (noteIndex < unit.newNotes.length) timer = setTimeout(showNote, 800);
    else done({ accuracy: 100, session: null, delayMs: 800 });
  }

  ctx.midi.addEventListener('noteon', onNoteOn);
  showNote();
  return () => {
    clearTimeout(timer);
    ctx.midi.removeEventListener('noteon', onNoteOn);
  };
}

/** Drill: flashcards read from the staff only (no name), new notes mixed with earlier ones. */
function renderDrill(body, ctx, { phase, unit }, done) {
  const pool = notePoolForUnit(unit.id);
  const progress = { ...ctx.getState().progress };
  const round = buildDrillRound(unit, progress, DRILL_LENGTH);
  const startedAt = new Date().toISOString();
  let index = 0;
  let correctCount = 0;
  let waiting = true;
  let timer = null;

  body.innerHTML = `
    <p class="lesson-instruction">Read the note on the staff and play it. The light-blue keys are the notes you know.</p>
    <p class="tag drill-progress" id="dr-progress"></p>
    <div id="dr-notation" class="notation-container notation-center"></div>
    <p class="feedback" id="dr-feedback"></p>
    <div id="dr-keyboard"></div>
  `;
  const notation = new Notation(body.querySelector('#dr-notation'));
  const keyboard = keyboardFor(body.querySelector('#dr-keyboard'), phase, pool);
  const feedbackEl = body.querySelector('#dr-feedback');
  const progressEl = body.querySelector('#dr-progress');

  function showPrompt() {
    waiting = true;
    progressEl.textContent = `${index + 1} / ${round.length} · ${correctCount} correct`;
    keyboard.clearStates();
    notation.renderSingleNote(round[index]);
    setFeedback(feedbackEl, 'Which note is this?');
  }

  function onNoteOn(e) {
    if (!waiting) return;
    waiting = false;
    const target = round[index];
    const played = e.detail.midi;
    const correct = played === target;
    progress[target] = updateNoteState(progress[target] || ctx.getNoteState(target), gradeAttempt({ correct, timingErrorMs: null }), null);
    ctx.saveProgress(progress).catch((err) => console.error('Failed to save progress', err));

    keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    if (correct) {
      correctCount += 1;
      setFeedback(feedbackEl, `Correct - ${midiToName(target)}!`, 'correct');
    } else {
      keyboard.setKeyState(target, 'target');
      setFeedback(feedbackEl, `That was ${midiToName(played)} - this one is ${midiToName(target)}.`, 'incorrect');
    }

    index += 1;
    const pauseMs = correct ? 700 : 1500;
    if (index < round.length) {
      timer = setTimeout(showPrompt, pauseMs);
      return;
    }
    const accuracy = Math.round((correctCount / round.length) * 100);
    done({
      accuracy,
      session: { startedAt, endedAt: new Date().toISOString(), attempts: round.length, correct: correctCount, accuracy },
      delayMs: pauseMs,
    });
  }

  ctx.midi.addEventListener('noteon', onNoteOn);
  showPrompt();
  return () => {
    clearTimeout(timer);
    ctx.midi.removeEventListener('noteon', onNoteOn);
  };
}

/** Shared scaffold for the steps that play a sequence with SequencePlayer. */
function mountPlayer(body, ctx, { phase, unit }, { instruction, controls = '' }, onFinish) {
  body.innerHTML = `
    <p class="lesson-instruction">${instruction}</p>
    ${controls ? `<div class="controls-row">${controls}</div>` : ''}
    <div class="notation-container" data-role="notation"></div>
    <p class="feedback" data-role="feedback"></p>
    <div data-role="keyboard"></div>
  `;
  const keyboard = keyboardFor(body.querySelector('[data-role="keyboard"]'), phase, notePoolForUnit(unit.id));
  return new SequencePlayer({
    ctx,
    notationEl: body.querySelector('[data-role="notation"]'),
    keyboard,
    feedbackEl: body.querySelector('[data-role="feedback"]'),
    onFinish,
  });
}

/** Read: a short melody over the unit's notes, no clock - the player waits for each note. */
function renderRead(body, ctx, entry, done) {
  const pool = notePoolForUnit(entry.unit.id);
  const player = mountPlayer(body, ctx, entry, {
    instruction: 'Play the melody from left to right. No metronome - take your time on each note.',
  }, (result) => done({ accuracy: result.accuracy, session: sessionFieldsFromResult(result), delayMs: 900 }));
  player.load(generateMelody(pool, MELODY_LENGTH, entry.unit.newNotes).map((midi) => ({ midi })));
  player.start({ mode: 'wait' });
  return () => player.destroy();
}

function bpmOptions(values, selected) {
  return values.map(({ value, label }) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

/** Play in time: a new melody over the unit's notes, with a metronome count-in. */
function renderTempo(body, ctx, entry, done) {
  const pool = notePoolForUnit(entry.unit.id);
  const player = mountPlayer(body, ctx, entry, {
    instruction: 'Now play a melody in time. Listen to 4 clicks, then play one note on every click.',
    controls: `
      <label>Tempo: <select data-role="bpm">${bpmOptions([50, 60, 70, 80].map((v) => ({ value: v, label: `${v} BPM` })), 60)}</select></label>
      <button class="btn-primary" data-role="start" type="button">Start</button>
    `,
  }, (result) => done({ accuracy: result.accuracy, session: sessionFieldsFromResult(result), delayMs: 900 }));

  const startBtn = body.querySelector('[data-role="start"]');
  const bpmSelect = body.querySelector('[data-role="bpm"]');
  player.load(generateMelody(pool, MELODY_LENGTH, entry.unit.newNotes).map((midi) => ({ midi })));
  startBtn.addEventListener('click', () => {
    startBtn.textContent = 'Restart';
    player.start({ mode: 'tempo', bpm: Number(bpmSelect.value) });
  });
  return () => player.destroy();
}

/** Song: a real piece using the unit's notes. A no-clock practice run is allowed but only the metronome run counts. */
function renderSong(body, ctx, entry, done) {
  const song = songForStep(entry.step);
  const tempos = [0.6, 0.8, 1].map((f) => ({ value: Math.round(song.bpm * f), label: `${Math.round(song.bpm * f)} BPM${f === 1 ? ' (original)' : ''}` }));
  let practicing = false;

  const player = mountPlayer(body, ctx, entry, {
    instruction: `<strong>${song.title}</strong> — play it with the metronome to finish the step. Want to learn it first? Use a practice run with no clock (it doesn't count).`,
    controls: `
      <button data-role="practice" type="button">Practice run (no clock)</button>
      <label>Tempo: <select data-role="bpm">${bpmOptions(tempos, tempos[1].value)}</select></label>
      <button class="btn-primary" data-role="start" type="button">Play with metronome</button>
    `,
  }, (result) => {
    if (practicing) {
      const feedback = body.querySelector('[data-role="feedback"]');
      setFeedback(feedback, `Practice run: ${result.accuracy}%. When you're ready, play it with the metronome.`, result.accuracy >= PASS_ACCURACY ? 'correct' : null);
      return;
    }
    done({ accuracy: result.accuracy, session: { songId: song.id, songTitle: song.title, ...sessionFieldsFromResult(result) }, delayMs: 900 });
  });

  player.load(song.notes, { timeSignature: song.timeSignature });
  body.querySelector('[data-role="practice"]').addEventListener('click', () => {
    practicing = true;
    player.start({ mode: 'wait' });
  });
  body.querySelector('[data-role="start"]').addEventListener('click', () => {
    practicing = false;
    player.start({ mode: 'tempo', bpm: Number(body.querySelector('[data-role="bpm"]').value) });
  });
  return () => player.destroy();
}
