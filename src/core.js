export const WORLD = Object.freeze({ width: 1000, height: 620, ground: 3000, start: 125, safeLine: 2550 });
export const TUNING = Object.freeze({ gravity: 510, terminal: 370, canopy: 108, move: 380, jumpWindow: 3, inflate: 0.34, step: 1 / 120 });
export const DIFFICULTIES = Object.freeze({
  cruise: { name: 'Cruise', description: 'Find your feet', count: 7, wind: 0, moving: false, seed: 1704 },
  rush: { name: 'Rush', description: 'Keep it sharp', count: 9, wind: 18, moving: true, seed: 2704 },
  storm: { name: 'Storm', description: 'Trust your nerve', count: 11, wind: 35, moving: true, seed: 3704 },
});

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCourse(difficulty = 'cruise', seed = DIFFICULTIES[difficulty]?.seed) {
  const level = DIFFICULTIES[difficulty] || DIFFICULTIES.cruise;
  const random = randomFromSeed(seed ?? level.seed);
  return Array.from({ length: level.count }, (_, index) => ({
    id: index,
    y: 520 + index * (1750 / (level.count - 1)),
    x: index % 4 === 3 ? (random() < 0.5 ? 0.12 : 0.88) : 0.22 + random() * 0.56,
    type: ['plane', 'balloon', 'drone'][index % 3],
    amplitude: level.moving && index % 3 !== 0 ? 0.07 : 0,
    phase: random() * Math.PI * 2,
  }));
}

export function obstacleAt(obstacle, time, laneWidth) {
  const sizes = { plane: [clamp(laneWidth * 0.22, 100, 210), 0.32], balloon: [clamp(laneWidth * 0.12, 52, 90), 1.3], drone: [clamp(laneWidth * 0.15, 70, 110), 0.38] };
  const [width, ratio] = sizes[obstacle.type];
  const height = width * ratio;
  return { ...obstacle, x: (obstacle.x + Math.sin(time * 1.2 + obstacle.phase) * obstacle.amplitude) * laneWidth, width, height };
}

function intersects(player, obstacle) {
  return Math.abs(player.x - obstacle.x) < 15 + obstacle.width * 0.38 &&
    Math.abs(player.y - obstacle.y) < 13 + obstacle.height * 0.38;
}

// All outcomes from a simulation step are resolved together, including both crashes
// or both landings. No winner depends on player iteration or a collision callback.
export function resolveOutcomes(players, outcomes) {
  if (!outcomes.length) return null;
  if (players.length === 1) return { winner: outcomes[0].type === 'land' ? 0 : null, draw: false, outcomes };
  const safe = outcomes.filter(event => event.type === 'land');
  if (safe.length === 2) return { winner: null, draw: true, outcomes };
  if (safe.length === 1) return { winner: safe[0].player, draw: false, outcomes };
  if (outcomes.length === 2) return { winner: null, draw: true, outcomes };
  return { winner: outcomes[0].player === 0 ? 1 : 0, draw: false, outcomes };
}

export class Flight {
  constructor({ mode = 'solo', difficulty = 'cruise', seed, demo = false } = {}) {
    this.mode = mode;
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'cruise';
    this.level = DIFFICULTIES[this.difficulty];
    this.seed = (seed ?? this.level.seed) >>> 0;
    this.course = generateCourse(this.difficulty, this.seed);
    this.demo = demo;
    this.time = 0;
    this.state = 'playing';
    this.result = null;
    this.events = [];
    this.laneWidth = WORLD.width / (mode === 'duo' ? 2 : 1);
    this.players = Array.from({ length: mode === 'duo' ? 2 : 1 }, (_, id) => ({
      id, x: this.laneWidth / 2, y: WORLD.start, vx: 0, vy: 0,
      status: 'ready', jumped: false, chute: false, safe: false,
      launchTime: null, landingTime: null, deployAltitude: null, inflate: 0,
      move: 0, action: false, reason: null,
    }));
  }

  input(id, { move, action } = {}) {
    const player = this.players[id];
    if (!player || this.state !== 'playing') return;
    if (Number.isFinite(move)) player.move = clamp(move, -1, 1);
    if (action) player.action = true;
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  takeEvents() { return this.events.splice(0); }

  step(delta = TUNING.step) {
    if (this.state !== 'playing') return;
    if (!Number.isFinite(delta) || delta <= 0) return;
    delta = Math.min(delta, 1 / 30);
    this.time += delta;
    const outcomes = [];
    for (const player of this.players) {
      if (this.demo) this.autopilot(player);
      if (player.action) {
        player.action = false;
        if (!player.jumped) {
          player.jumped = true;
          player.status = 'falling';
          player.launchTime = this.time;
          this.events.push({ type: 'jump', player: player.id });
        } else if (!player.chute) {
          player.chute = true;
          player.safe = player.y <= WORLD.safeLine;
          player.deployAltitude = Math.max(0, (WORLD.ground - player.y) / 3);
          player.inflate = 0;
          player.status = player.safe ? 'canopy' : 'late';
          this.events.push({ type: 'deploy', player: player.id, safe: player.safe });
        }
      }
      if (!player.jumped) {
        if (this.time >= TUNING.jumpWindow) outcomes.push({ type: 'crash', player: player.id, reason: 'Missed the jump window' });
        continue;
      }

      // Steering is individual: the other player's launch never locks your controls.
      const wind = Math.sin(this.time * 0.65 + this.seed % 17) * this.level.wind;
      player.vx = player.move * TUNING.move + wind;
      player.x = clamp(player.x + player.vx * delta, 40, this.laneWidth - 40);
      if (player.chute && player.safe) {
        player.inflate = Math.min(TUNING.inflate, player.inflate + delta);
        const limit = TUNING.terminal + (TUNING.canopy - TUNING.terminal) * (player.inflate / TUNING.inflate);
        player.vy = Math.min(limit, player.vy + TUNING.gravity * delta);
      } else player.vy = Math.min(TUNING.terminal, player.vy + TUNING.gravity * delta);
      player.y += player.vy * delta;

      const obstacle = this.course.find(item => intersects(player, obstacleAt(item, this.time, this.laneWidth)));
      if (obstacle) outcomes.push({ type: 'crash', player: player.id, reason: `Hit a ${obstacle.type}` });
      else if (player.y >= WORLD.ground - 16) {
        player.y = WORLD.ground - 16;
        if (player.chute && player.safe) outcomes.push({ type: 'land', player: player.id });
        else outcomes.push({ type: 'crash', player: player.id, reason: player.chute ? 'Opened below the safe line' : 'Never opened the parachute' });
      }
    }

    const result = resolveOutcomes(this.players, outcomes);
    if (result) {
      for (const event of outcomes) {
        const player = this.players[event.player];
        player.status = event.type === 'land' ? 'landed' : 'crashed';
        player.reason = event.reason || null;
        if (event.type === 'land') player.landingTime = this.time - player.launchTime;
        this.events.push(event);
      }
      this.state = 'over';
      this.result = { ...result, time: this.time };
    }
  }

  autopilot(player) {
    if (!player.jumped) { player.action = this.time > 0.6; return; }
    const next = this.course.find(item => {
      const obstacle = obstacleAt(item, this.time, this.laneWidth);
      return item.y > player.y - (obstacle.height * 0.38 + 26) && item.y < player.y + 450;
    });
    let target = this.laneWidth / 2;
    if (next) {
      const arrival = Math.max(0, next.y - player.y) / Math.max(player.vy, 180);
      const obstacle = obstacleAt(next, this.time + arrival, this.laneWidth);
      const clearance = 15 + obstacle.width * 0.38 + 35;
      target = player.x;
      if (Math.abs(player.x - obstacle.x) < clearance) {
        const left = obstacle.x - clearance, right = obstacle.x + clearance;
        const leftFits = left >= 40, rightFits = right <= this.laneWidth - 40;
        target = leftFits && (!rightFits || Math.abs(left - player.x) < Math.abs(right - player.x)) ? left : right;
      }
    }
    player.move = clamp((target - player.x) / 60, -1, 1);
    if (!player.chute && player.y >= WORLD.safeLine - 90) player.action = true;
  }
}

export function recordKey(difficulty, input = 'keys') { return `${difficulty}:${input}`; }

export function addRecord(records, difficulty, input, time) {
  if (!Number.isFinite(time) || time <= 0) return { records, isBest: false };
  const key = recordKey(difficulty, input);
  const previous = Array.isArray(records[key]) ? records[key].filter(value => Number.isFinite(value) && value > 0) : [];
  return {
    records: { ...records, [key]: [...previous, time].sort((a, b) => a - b).slice(0, 5) },
    isBest: previous.length === 0 || time < Math.min(...previous),
  };
}

export function advanceMatch(match, result) {
  const scores = [...match.scores];
  if (result.winner !== null && !result.draw) scores[result.winner] += 1;
  const complete = scores.some(score => score >= 2);
  return { scores, round: match.round + (result.draw ? 0 : 1), complete, winner: complete ? scores.findIndex(score => score >= 2) : null };
}
