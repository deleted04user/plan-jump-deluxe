import { Flight, WORLD, TUNING, DIFFICULTIES, clamp, addRecord, advanceMatch, recordKey } from './core.js';
import { loadPreferences, savePreferences } from './storage.js';
import { FlightRenderer } from './renderer.js';
import { FlightAudio } from './audio.js';
import { HandTracker } from './handTracker.js';

const byId = id => document.getElementById(id);
const canvas = byId('game-canvas');
const renderer = new FlightRenderer(canvas);
const audio = new FlightAudio();
let preferences = loadPreferences();
let flight = null;
let match = null;
let resultShown = false;
let runInput = 'keys';
let accumulator = 0;
let lastFrame = performance.now();
let lastHud = 0;
const heldKeys = new Set();
const touchMoves = [new Map(), new Map()];
const homeInput = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys';
const stateLabels = { ready: 'READY TO JUMP', falling: 'FREEFALL', canopy: 'CHUTE OPEN · SAFE', late: 'TOO LATE · BELOW 150 M', landed: 'SAFE LANDING', crashed: 'FLIGHT ENDED' };

const tracker = new HandTracker({ onChange(state, message) {
  const enabled = state !== 'off' && state !== 'error';
  byId('camera-button').setAttribute('aria-pressed', String(enabled));
  byId('camera-button').textContent = enabled ? 'Turn camera off' : 'Try hand steering ↗';
  byId('camera-status').hidden = state === 'off';
  const messages = { starting: 'Starting camera… keyboard and touch still work.', ready: 'Show your hand to steer · Space or Deploy opens the chute.', tracking: 'Hand steering active · Space or Deploy opens the chute.' };
  byId('camera-status').textContent = message || messages[state] || '';
  if (state === 'ready' && tracker.video && !tracker.video.isConnected) {
    tracker.video.className = 'camera-preview'; tracker.video.setAttribute('aria-label', 'Mirrored camera preview');
    byId('game-stage').append(tracker.video);
  }
  if (state === 'error') announce(message);
} });

function announce(message) { byId('announcements').textContent = message; }
function persist() { return savePreferences(preferences); }
function clearInputs() {
  heldKeys.clear(); touchMoves.forEach(moves => moves.clear());
  document.querySelectorAll('.steer').forEach(button => button.classList.remove('is-held'));
  flight?.players.forEach(player => { player.move = 0; player.action = false; });
}
function closeDialogs() {
  for (const id of ['pause-dialog', 'result-dialog']) if (byId(id).open) byId(id).close();
}
function syncSound() {
  byId('sound-toggle').setAttribute('aria-pressed', String(preferences.sound));
  byId('sound-toggle').setAttribute('aria-label', preferences.sound ? 'Mute sound' : 'Enable sound');
  byId('sound-label').textContent = preferences.sound ? 'Sound on' : 'Sound off';
}
function syncHomeRecord() {
  const best = preferences.records[recordKey(preferences.difficulty, homeInput)]?.[0];
  const label = byId('home-record'); label.replaceChildren();
  label.append(document.createTextNode(`${preferences.difficulty.toUpperCase()} BEST `));
  const value = document.createElement('strong'); value.textContent = best ? `${best.toFixed(2)} s` : '—'; label.append(value);
}
function startFlight(mode = 'solo', { demo = false, continueMatch = false } = {}) {
  tracker.stop(); closeDialogs(); clearInputs();
  if (mode === 'duo' && (!continueMatch || !match || match.complete)) match = { scores: [0, 0], round: 1, complete: false, winner: null };
  if (mode !== 'duo') match = null;
  const seed = mode === 'duo' ? DIFFICULTIES[preferences.difficulty].seed + (match.round - 1) * 997 : undefined;
  flight = new Flight({ mode, difficulty: preferences.difficulty, seed, demo });
  resultShown = false; runInput = homeInput; accumulator = 0; lastFrame = performance.now();
  document.body.dataset.mode = mode;
  byId('home-panel').hidden = true; byId('home-footer').hidden = true;
  byId('game-hud').hidden = false; byId('flight-controls').hidden = false; byId('pause-button').hidden = false;
  byId('pilot-1').hidden = mode !== 'duo'; byId('second-controls').hidden = mode !== 'duo';
  document.querySelector('[data-player="0"]').hidden = demo;
  byId('camera-button').hidden = mode === 'duo' || demo;
  byId('demo-badge').hidden = !demo; byId('demo-controls').hidden = !demo;
  byId('pilot-0').querySelector('.pilot-name').firstChild.textContent = mode === 'duo' ? 'PLAYER 01 ' : demo ? 'AUTOPILOT ' : 'YOUR FLIGHT ';
  byId('control-name-0').textContent = mode === 'duo' ? 'PLAYER 01' : 'YOUR CONTROLS';
  document.querySelector('[data-action="0"] kbd').textContent = mode === 'duo' ? 'W' : 'SPACE';
  byId('flight-note').textContent = demo ? 'AUTOPILOT SHOWS THE ROUTE. YOUR RECORDS STAY YOURS.' : mode === 'duo' ? 'MATCHED COURSES. FIRST TO TWO WINS. SAME-STEP TIES ARE A DRAW.' : `${preferences.difficulty.toUpperCase()} · SAME COURSE EVERY FLIGHT. FIND YOUR PERSONAL BEST.`;
  audio.unlock(); updateHud();
  canvas.focus({ preventScroll: true });
  byId('flight-deck').scrollIntoView({ behavior: renderer.reducedMotion ? 'instant' : 'smooth', block: 'start' });
  announce(`${demo ? 'Demo' : mode === 'duo' ? 'Two-player race' : 'Solo flight'} started. Jump within three seconds. ${mode === 'duo' ? 'Player 1 uses W, A, D. Player 2 uses the arrow keys.' : 'Space jumps and deploys. Left and right arrows steer.'}`);
}

function goHome() {
  tracker.stop(); closeDialogs(); clearInputs(); flight = null; match = null; resultShown = false;
  document.body.dataset.mode = 'home';
  byId('home-panel').hidden = false; byId('home-footer').hidden = false;
  byId('game-hud').hidden = true; byId('flight-controls').hidden = true; byId('pause-button').hidden = true;
  byId('deck-status').textContent = 'READY FOR TAKE-OFF';
  byId('flight-note').textContent = 'BEST OF THREE WITH A FRIEND. ONE PERSONAL BEST ON YOUR OWN.';
  syncHomeRecord(); audio.resume(); byId('solo-button').focus({ preventScroll: true }); announce('Back at the flight deck.');
}

function pauseFlight() {
  if (!flight || flight.state !== 'playing') return;
  flight.pause(); clearInputs(); tracker.stop(); audio.pause(); updateHud();
  byId('pause-dialog').showModal(); byId('resume-button').focus(); announce('Flight paused.');
}
function resumeFlight() {
  if (flight?.state !== 'paused') return;
  byId('pause-dialog').close(); clearInputs(); flight.resume(); accumulator = 0; lastFrame = performance.now();
  audio.resume(); canvas.focus({ preventScroll: true }); updateHud(); announce('Flight resumed.');
}
function restartFlight() { if (flight) startFlight(flight.mode, { demo: flight.demo, continueMatch: flight.mode === 'duo' }); }

function updateHud() {
  if (!flight) return;
  const { mode, demo } = flight;
  const allJumped = flight.players.every(player => player.jumped);
  byId('launch-clock').hidden = allJumped || flight.state === 'over';
  byId('jump-timer').textContent = Math.max(0, TUNING.jumpWindow - flight.time).toFixed(1);
  byId('deck-status').textContent = flight.state === 'paused' ? 'HOLDING PATTERN' : mode === 'duo' ? `ROUND ${Math.min(match.round, 3)} / 3 · ${flight.difficulty.toUpperCase()}` : `${demo ? 'DEMO FLIGHT' : 'SOLO FLIGHT'} · ${flight.difficulty.toUpperCase()}`;
  for (const player of flight.players) {
    byId(`altitude-${player.id}`).textContent = player.status === 'landed' ? 0 : Math.max(0, Math.round((WORLD.ground - player.y) / 3));
    byId(`pilot-state-${player.id}`).textContent = stateLabels[player.status];
    const seconds = player.landingTime ?? (player.launchTime === null ? 0 : flight.time - player.launchTime);
    byId(`flight-time-${player.id}`).textContent = `${seconds.toFixed(2)} s`;
    byId(`score-${player.id}`).textContent = mode === 'duo' ? `${match.scores[player.id]} W` : '';
    const action = document.querySelector(`[data-action="${player.id}"]`);
    action.querySelector('.action-label').textContent = player.chute ? 'Deployed ✓' : player.jumped ? 'Deploy' : 'Jump';
    action.setAttribute('aria-label', `Player ${player.id + 1} ${player.jumped ? 'deploy parachute' : 'jump'}`);
    action.disabled = player.chute || flight.state !== 'playing';
  }
  canvas.dataset.state = flight.state;
}

function resultStat(label, value) {
  const box = document.createElement('div'); box.className = 'result-stat';
  const name = document.createElement('span'); name.textContent = label;
  const number = document.createElement('strong'); number.textContent = value; box.append(name, number); return box;
}
function showResult() {
  resultShown = true; tracker.stop(); clearInputs();
  const result = flight.result, player = flight.players[0];
  const success = result.winner !== null;
  const outcome = result.draw ? 'draw' : success ? 'land' : 'crash';
  const dialog = byId('result-dialog'); dialog.dataset.outcome = outcome;
  byId('result-symbol').textContent = result.draw ? '=' : success ? '↗' : '×';
  byId('result-stats').replaceChildren(); byId('match-score').hidden = flight.mode !== 'duo';
  let title, copy;
  if (flight.mode === 'duo') {
    match = advanceMatch(match, result);
    title = result.draw ? 'A perfect tie.' : match.complete ? `Player ${match.winner + 1} takes it.` : `Player ${result.winner + 1} wins.`;
    const event = result.outcomes.find(event => event.type === 'crash');
    copy = result.draw ? 'Same moment. Same outcome. Run that round again.' : event ? `Player ${event.player + 1}: ${event.reason.toLowerCase()}.` : 'First to the ground. Parachute open. Job done.';
    byId('result-stats').append(resultStat('PLAYER 01', `${match.scores[0]} wins`), resultStat('PLAYER 02', `${match.scores[1]} wins`));
    byId('match-score').textContent = match.complete ? 'MATCH COMPLETE · FIRST TO TWO WINS' : `ROUND ${Math.min(match.round, 3)} NEXT · FIRST TO TWO WINS`;
    byId('again-button').textContent = match.complete ? 'New match ↗' : result.draw ? 'Replay this round ↗' : 'Next round ↗';
    byId('result-eyebrow').textContent = match.complete ? 'MATCH REPORT' : 'ROUND REPORT';
  } else {
    let isBest = false, stored = true;
    if (success && !flight.demo) {
      const record = addRecord(preferences.records, flight.difficulty, runInput, player.landingTime);
      preferences.records = record.records; isBest = record.isBest; stored = persist(); syncHomeRecord();
    }
    title = flight.demo ? success ? 'Now it’s your turn.' : 'Even pilots miss.' : success ? isBest ? 'Your best drop yet.' : 'Good drop.' : 'Gravity got you.';
    copy = success ? flight.demo ? 'Dodge first. Deploy just above 150 m. You’ve got this.' : stored ? 'A clean landing. The sky rewards a steady hand.' : 'A clean landing. Your record is available for this visit; browser storage is unavailable.' : `${player.reason}. ${player.reason === 'Missed the jump window' ? 'Press Space or tap Jump as the flight starts.' : 'Shake it off. The next flight is ready.'}`;
    byId('result-stats').append(resultStat('FLIGHT TIME', success ? `${player.landingTime.toFixed(2)} s` : '—'), resultStat('CHUTE OPENED', player.deployAltitude === null ? '—' : `${Math.round(player.deployAltitude)} m`));
    byId('again-button').textContent = flight.demo ? 'Take a solo flight ↗' : 'Fly again ↗';
    byId('result-eyebrow').textContent = flight.demo ? 'DEMO COMPLETE' : isBest ? `PERSONAL BEST · ${runInput.toUpperCase()}` : 'FLIGHT REPORT';
  }
  byId('result-title').textContent = title; byId('result-copy').textContent = copy;
  updateHud(); dialog.showModal(); byId('again-button').focus(); announce(`${title} ${copy}`);
}

function updateControls() {
  if (!flight || flight.demo || flight.state !== 'playing') return;
  for (const player of flight.players) {
    const left = flight.mode === 'duo' && player.id === 0 ? 'KeyA' : 'ArrowLeft';
    const right = flight.mode === 'duo' && player.id === 0 ? 'KeyD' : 'ArrowRight';
    let move = (heldKeys.has(right) ? 1 : 0) - (heldKeys.has(left) ? 1 : 0);
    move += [...touchMoves[player.id].values()].reduce((sum, direction) => sum + direction, 0);
    if (flight.mode === 'solo' && tracker.ready && tracker.active) {
      const target = 40 + tracker.x * (flight.laneWidth - 80);
      move = clamp((target - player.x) / 60, -1, 1); runInput = 'camera';
    }
    flight.input(player.id, { move });
  }
}

function frame(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.08); lastFrame = now;
  if (flight?.state === 'playing') {
    accumulator += delta;
    while (accumulator >= TUNING.step && flight.state === 'playing') { updateControls(); flight.step(); accumulator -= TUNING.step; }
    for (const event of flight.takeEvents()) audio.effect(event.type);
    if (flight.state === 'over' && !resultShown) showResult();
  }
  if (now - lastHud > 80) { updateHud(); lastHud = now; }
  renderer.draw(flight, now / 1000); requestAnimationFrame(frame);
}

byId('solo-button').addEventListener('click', () => startFlight());
byId('duo-button').addEventListener('click', () => startFlight('duo'));
byId('demo-button').addEventListener('click', () => startFlight('solo', { demo: true }));
byId('demo-play-button').addEventListener('click', () => startFlight());
byId('pause-button').addEventListener('click', pauseFlight);
byId('resume-button').addEventListener('click', resumeFlight);
byId('pause-restart').addEventListener('click', restartFlight);
byId('pause-menu').addEventListener('click', goHome);
byId('result-menu').addEventListener('click', goHome);
byId('again-button').addEventListener('click', () => flight?.demo ? startFlight() : startFlight(flight.mode, { continueMatch: flight.mode === 'duo' }));
byId('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); resumeFlight(); });
byId('result-dialog').addEventListener('cancel', event => { event.preventDefault(); goHome(); });
byId('sound-toggle').addEventListener('click', () => { preferences.sound = !preferences.sound; audio.setEnabled(preferences.sound); syncSound(); persist(); });
byId('camera-button').addEventListener('click', () => {
  if (flight?.state !== 'playing' || flight.demo || flight.mode !== 'solo') return;
  if (byId('camera-button').getAttribute('aria-pressed') === 'true') tracker.stop();
  else tracker.start();
});
document.querySelectorAll('input[name="difficulty"]').forEach(input => {
  input.checked = input.value === preferences.difficulty;
  input.addEventListener('change', () => { preferences.difficulty = input.value; syncHomeRecord(); persist(); });
});
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', event => {
  if (!flight || flight.demo || flight.state !== 'playing') return;
  if (event.detail > 0 && runInput !== 'camera') runInput = 'touch';
  audio.unlock(); flight.input(Number(button.dataset.action), { action: true }); canvas.focus({ preventScroll: true });
}));
document.querySelectorAll('.steer').forEach(button => {
  const id = Number(button.closest('[data-player]').dataset.player);
  button.addEventListener('pointerdown', event => {
    if (flight?.state !== 'playing' || flight.demo) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    touchMoves[id].set(event.pointerId, Number(button.dataset.move)); button.classList.add('is-held');
    if (runInput !== 'camera') runInput = 'touch';
  });
  const release = event => { touchMoves[id].delete(event.pointerId); button.classList.remove('is-held'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea')) return;
  const interactive = event.target instanceof HTMLElement && event.target.closest('button,a,summary');
  if (event.repeat) { if (flight?.state === 'playing' && ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.code)) event.preventDefault(); return; }
  if (event.code === 'KeyM') { byId('sound-toggle').click(); return; }
  if ((event.code === 'KeyP' || event.code === 'Escape') && flight?.state !== 'over') {
    if (!flight) return;
    event.preventDefault(); flight.state === 'paused' ? resumeFlight() : pauseFlight(); return;
  }
  if (event.code === 'KeyR' && flight && !byId('result-dialog').open && !byId('pause-dialog').open) { event.preventDefault(); restartFlight(); return; }
  if (!flight || flight.state !== 'playing' || flight.demo || byId('pause-dialog').open || byId('result-dialog').open) return;
  if (interactive && ['Space', 'Enter'].includes(event.code)) return;
  const controls = ['Space', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyD'];
  if (!controls.includes(event.code)) return;
  event.preventDefault(); heldKeys.add(event.code); audio.unlock();
  if (flight.mode === 'solo' && event.code === 'Space') flight.input(0, { action: true });
  if (flight.mode === 'duo' && event.code === 'KeyW') flight.input(0, { action: true });
  if (flight.mode === 'duo' && event.code === 'ArrowUp') flight.input(1, { action: true });
});
document.addEventListener('keyup', event => heldKeys.delete(event.code));
window.addEventListener('blur', () => { clearInputs(); if (flight?.state === 'playing') pauseFlight(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseFlight(); tracker.stop(); audio.pause(); }
  else if (!flight || flight.state === 'playing') audio.resume();
});
window.addEventListener('pagehide', () => { tracker.stop(); audio.pause(); });

audio.enabled = preferences.sound; syncSound(); syncHomeRecord();
document.body.dataset.mode = 'home'; requestAnimationFrame(frame);
