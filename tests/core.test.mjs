import test from 'node:test';
import assert from 'node:assert/strict';
import { Flight, WORLD, TUNING, DIFFICULTIES, generateCourse, obstacleAt, resolveOutcomes, addRecord, advanceMatch } from '../src/core.js';
import { loadPreferences, savePreferences } from '../src/storage.js';

const advance = (flight, seconds) => { for (let i = 0; i < Math.round(seconds / TUNING.step); i++) flight.step(); };

test('courses are reproducible and difficulty adds hazards', () => {
  assert.deepEqual(generateCourse('rush', 99), generateCourse('rush', 99));
  assert.notDeepEqual(generateCourse('rush', 99), generateCourse('rush', 100));
  assert.equal(generateCourse('cruise').length, 7); assert.equal(generateCourse('storm').length, 11);
});
test('obstacles stay above the deployment area at every difficulty', () => {
  const flight = new Flight({ mode: 'duo', difficulty: 'storm', seed: 909 });
  for (const obstacle of flight.course) {
    assert.ok(obstacle.y < WORLD.safeLine - 200);
  }
});
test('early jumper can steer while the other player waits', () => {
  const flight = new Flight({ mode: 'duo' });
  flight.input(0, { action: true, move: -1 }); advance(flight, 0.5);
  assert.equal(flight.players[1].jumped, false);
  assert.ok(flight.players[0].x < flight.laneWidth / 2 - 100);
  assert.ok(flight.players[0].y > WORLD.start);
  assert.equal(flight.state, 'playing');
});
test('early jumper can deploy before the other player jumps', () => {
  const flight = new Flight({ mode: 'duo' });
  flight.input(0, { action: true }); flight.step(); flight.input(0, { action: true }); flight.step();
  assert.equal(flight.players[0].chute, true); assert.equal(flight.players[1].jumped, false);
});
test('missing both launch windows is a draw', () => {
  const flight = new Flight({ mode: 'duo' }); advance(flight, 3.1);
  assert.equal(flight.result.draw, true); assert.equal(flight.result.winner, null);
  assert.equal(flight.result.outcomes.length, 2);
});
test('a missed solo launch ends with an actionable reason', () => {
  const flight = new Flight(); advance(flight, 3.1);
  assert.equal(flight.result.winner, null); assert.equal(flight.players[0].reason, 'Missed the jump window');
});
test('simultaneous collisions are a draw regardless of player order', () => {
  const flight = new Flight({ mode: 'duo' });
  const obstacle = obstacleAt(flight.course[0], TUNING.step, flight.laneWidth);
  for (const player of flight.players) Object.assign(player, { jumped: true, launchTime: 0, x: obstacle.x, y: obstacle.y, vy: 0 });
  flight.step(); assert.equal(flight.result.draw, true); assert.equal(flight.result.outcomes.length, 2);
  for (const outcomes of [[{ type: 'crash', player: 0 }, { type: 'crash', player: 1 }], [{ type: 'crash', player: 1 }, { type: 'crash', player: 0 }]]) assert.equal(resolveOutcomes(flight.players, outcomes).draw, true);
});
test('same-step landings are a draw and a solo safe landing wins', () => {
  for (const mode of ['solo', 'duo']) {
    const flight = new Flight({ mode }); flight.course = [];
    for (const player of flight.players) Object.assign(player, { jumped: true, launchTime: 0, y: WORLD.ground - 16.5, vy: 108, chute: true, safe: true, inflate: TUNING.inflate });
    flight.step(); assert.equal(flight.result.draw, mode === 'duo');
    assert.equal(flight.players[0].status, 'landed'); assert.ok(flight.players[0].landingTime > 0);
  }
});
test('safe landing beats a simultaneous crash', () => {
  const result = resolveOutcomes([{}, {}], [{ type: 'crash', player: 0 }, { type: 'land', player: 1 }]);
  assert.equal(result.winner, 1); assert.equal(result.draw, false);
});
test('deploying below the line remains unsafe and cannot produce a record', () => {
  const flight = new Flight(); flight.course = [];
  Object.assign(flight.players[0], { jumped: true, launchTime: 0, y: WORLD.safeLine + 1, vy: TUNING.terminal });
  flight.input(0, { action: true }); advance(flight, 2);
  assert.equal(flight.players[0].safe, false); assert.equal(flight.players[0].landingTime, null);
  assert.equal(flight.players[0].reason, 'Opened below the safe line');
});
test('safe chute inflates gradually then caps descent speed', () => {
  const flight = new Flight(); flight.course = [];
  Object.assign(flight.players[0], { jumped: true, launchTime: 0, y: 1800, vy: TUNING.terminal });
  flight.input(0, { action: true }); flight.step();
  assert.ok(flight.players[0].vy > TUNING.canopy && flight.players[0].vy < TUNING.terminal);
  advance(flight, 0.5); assert.equal(flight.players[0].vy, TUNING.canopy);
});
test('pause freezes simulation, resume continues, and lanes have hard bounds', () => {
  const flight = new Flight(); flight.course = []; flight.input(0, { action: true, move: -1 }); advance(flight, 0.5);
  flight.pause(); const before = JSON.stringify(flight.players); const time = flight.time; advance(flight, 2);
  assert.equal(flight.time, time); assert.equal(JSON.stringify(flight.players), before);
  flight.resume(); advance(flight, 1); assert.equal(flight.players[0].x, 40); assert.ok(flight.time > time);
});
test('autopilot completes all difficulty demonstrations without crashing', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const flight = new Flight({ difficulty, demo: true }); advance(flight, 35);
    assert.equal(flight.result?.winner, 0, `${difficulty}: ${flight.players[0].reason}`);
    assert.ok(flight.players[0].deployAltitude > 150);
    assert.ok(flight.players[0].landingTime > 10 && flight.players[0].landingTime < 30);
  }
});
test('identical autopilots tie on a fair duo course', () => {
  const flight = new Flight({ mode: 'duo', difficulty: 'rush', demo: true }); advance(flight, 35);
  assert.equal(flight.players[0].status, 'landed'); assert.equal(flight.players[1].status, 'landed');
  assert.equal(flight.result.draw, true); assert.equal(flight.players[0].landingTime, flight.players[1].landingTime);
});
test('records retain five fastest times and separate difficulty and input', () => {
  let records = {};
  for (const time of [20, 19, 25, 17, 15, 21, 16]) records = addRecord(records, 'cruise', 'keys', time).records;
  records = addRecord(records, 'storm', 'camera', 12).records;
  assert.deepEqual(records['cruise:keys'], [15, 16, 17, 19, 20]); assert.deepEqual(records['storm:camera'], [12]);
  assert.equal(addRecord(records, 'cruise', 'keys', NaN).isBest, false);
});
test('first-to-two match handles wins and replays drawn rounds', () => {
  let match = { scores: [0, 0], round: 1 };
  match = advanceMatch(match, { winner: 0, draw: false }); assert.deepEqual(match.scores, [1, 0]);
  match = advanceMatch(match, { winner: null, draw: true }); assert.equal(match.round, 2);
  match = advanceMatch(match, { winner: 1, draw: false }); assert.equal(match.complete, false);
  match = advanceMatch(match, { winner: 0, draw: false }); assert.equal(match.complete, true); assert.equal(match.winner, 0);
});
test('corrupt or unavailable storage never interrupts play', () => {
  const denied = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } };
  assert.deepEqual(loadPreferences(denied).records, {}); assert.equal(savePreferences({}, denied), false);
  assert.equal(loadPreferences({ getItem: () => 'bad JSON' }).difficulty, 'cruise');
  const stored = loadPreferences({ getItem: () => JSON.stringify({ difficulty: 'invalid', records: { 'cruise:keys': [20, -1, null, 10], 'bad:key': [12] } }) });
  assert.deepEqual(stored.records, { 'cruise:keys': [10, 20] }); assert.equal(stored.difficulty, 'cruise');
});
test('a browser that denies access to the storage property still loads safely', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.equal(loadPreferences().difficulty, 'cruise'); assert.equal(savePreferences({}), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
