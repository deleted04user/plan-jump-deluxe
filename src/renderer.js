import { WORLD, TUNING, clamp, obstacleAt, randomFromSeed } from './core.js';

const COLORS = ['#d5f768', '#bda7ff'];
export class FlightRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.images = {};
    for (const [key, filename] of Object.entries({ diver: 'falling.png', plane: 'plan.png', boom: 'boom.png' })) {
      const image = new Image(); image.src = new URL(`../assets/${filename}`, import.meta.url).href;
      this.images[key] = image;
    }
    const random = randomFromSeed(123);
    this.clouds = Array.from({ length: 24 }, () => ({ x: random(), y: random() * 3300, size: 30 + random() * 45 }));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  }

  draw(flight, clock) {
    const ctx = this.context;
    const scale = this.canvas.width / WORLD.width;
    this.viewHeight = this.canvas.height / scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, WORLD.width, this.viewHeight);
    if (!flight) { this.home(clock); return; }
    for (const player of flight.players) {
      const x = player.id * flight.laneWidth;
      const camera = clamp(player.y - this.viewHeight * 0.36, 0, WORLD.ground - this.viewHeight + 80);
      ctx.save(); ctx.beginPath(); ctx.rect(x, 0, flight.laneWidth, this.viewHeight); ctx.clip(); ctx.translate(x, 0);
      this.sky(camera, flight.laneWidth, clock);
      const ground = WORLD.ground - camera;
      if (ground < this.viewHeight + 180) this.ground(ground, flight.laneWidth);
      const line = WORLD.safeLine - camera;
      if (line > -20 && line < this.viewHeight) {
        ctx.strokeStyle = '#dc6b59'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(0, line); ctx.lineTo(flight.laneWidth, line); ctx.stroke(); ctx.setLineDash([]);
        this.label('LAST SAFE DEPLOY · 150 M', flight.laneWidth / 2, line - 14, '#9a4239', 11, 'center');
      }
      for (const item of flight.course) {
        const obstacle = obstacleAt(item, flight.time, flight.laneWidth);
        const y = obstacle.y - camera;
        if (y < -100 || y > this.viewHeight + 100) continue;
        ctx.save(); ctx.translate(obstacle.x, y);
        if (item.type === 'plane') this.plane(obstacle.width, clock);
        else if (item.type === 'balloon') { ctx.scale(obstacle.width / 43, obstacle.height / 58); this.balloon(); }
        else { ctx.scale(obstacle.width / 55, obstacle.height / 21); this.drone(clock); }
        ctx.restore();
      }
      if (!player.jumped) this.helicopter(flight.laneWidth / 2, 65, clock);
      if (player.jumped && player.status !== 'crashed' && !player.chute && !this.reducedMotion) {
        ctx.strokeStyle = 'rgba(255,255,255,.48)'; ctx.lineWidth = 2;
        for (let index = 0; index < 5; index++) {
          const sx = player.x + (index - 2) * 27;
          const sy = player.y - camera - 40 - ((clock * 230 + index * 25) % 95);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 20); ctx.stroke();
        }
      }
      this.player(player, player.y - camera, COLORS[player.id]);
      if (player.status === 'crashed') {
        ctx.fillStyle = 'rgba(224,88,73,.08)'; ctx.fillRect(0, 0, flight.laneWidth, this.viewHeight);
        const boom = this.images.boom;
        if (boom.complete && boom.naturalWidth) ctx.drawImage(boom, player.x - 58, player.y - camera - 58, 116, 116);
      }
      this.gauge(player, flight.laneWidth - 24, COLORS[player.id]);
      ctx.restore();
    }
    if (flight.players.length === 2) {
      ctx.fillStyle = '#102d36'; ctx.fillRect(WORLD.width / 2 - 2, 0, 4, this.viewHeight);
    }
  }

  sky(camera, width, clock) {
    const ctx = this.context;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.viewHeight);
    gradient.addColorStop(0, '#8ac7dd'); gradient.addColorStop(1, '#dbf1e8');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, this.viewHeight);
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.viewHeight); ctx.stroke(); }
    for (let y = -(camera % 80); y < this.viewHeight; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    for (const cloud of this.clouds) {
      const y = cloud.y - camera * 0.7;
      if (y < -90 || y > this.viewHeight + 90) continue;
      const drift = this.reducedMotion ? 0 : Math.sin(clock * 0.2 + cloud.x * 10) * 16;
      this.cloud(cloud.x * width + drift, y, cloud.size, 0.55);
    }
  }

  home(clock) {
    const ctx = this.context;
    this.sky(0, WORLD.width, clock);
    const height = this.viewHeight;
    ctx.fillStyle = '#f6f0c6'; ctx.beginPath(); ctx.arc(845, height * 0.2, 72, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(16,45,54,.08)'; ctx.lineWidth = 1.5;
    for (let radius = 125; radius < 300; radius += 55) { ctx.beginPath(); ctx.arc(760, height * 0.42, radius, 0, Math.PI * 2); ctx.stroke(); }
    const bob = this.reducedMotion ? 0 : Math.sin(clock * 1.4) * 12;
    ctx.save(); if (height > 900) ctx.globalAlpha = 0.55;
    ctx.translate(747, height * 0.42 + bob); ctx.rotate(-0.15); this.diver(266); ctx.restore();
    ctx.save(); ctx.translate(871, height * 0.7); ctx.rotate(-0.16); this.plane(142, clock); ctx.restore();
    this.cloud(656, height * 0.74, 82, 0.8); this.cloud(965, height * 0.53, 59, 0.7);
    ctx.strokeStyle = '#c76b58'; ctx.setLineDash([9, 9]); ctx.beginPath(); ctx.moveTo(600, height * 0.85); ctx.lineTo(950, height * 0.85); ctx.stroke(); ctx.setLineDash([]);
    this.label('THE LATER YOU PULL, THE FASTER YOU LAND.', 773, height * 0.9, '#295661', 11, 'center');
    this.label('ALT  0960', 836, 70, '#295661', 12);
    ctx.strokeStyle = '#295661'; ctx.beginPath(); ctx.moveTo(838, 80); ctx.lineTo(911, 80); ctx.stroke();
  }

  cloud(x, y, size, alpha) {
    const ctx = this.context;
    ctx.save(); ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath(); ctx.ellipse(x, y, size, size * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(x - size * 0.35, y - size * 0.2, size * 0.42, size * 0.33, 0, 0, Math.PI * 2);
    ctx.ellipse(x + size * 0.2, y - size * 0.27, size * 0.42, size * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  ground(y, width) {
    const ctx = this.context;
    ctx.fillStyle = '#93bcb0'; ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= width + 150; x += 150) ctx.lineTo(x, y - 55 - (x % 300 === 0 ? 38 : 0));
    ctx.lineTo(width, y + 40); ctx.lineTo(0, y + 40); ctx.fill();
    ctx.fillStyle = '#28665e'; ctx.fillRect(0, y, width, this.viewHeight);
    ctx.fillStyle = '#d5f768'; ctx.fillRect(0, y, width, 7);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let x = 30; x < width; x += 60) ctx.fillRect(x, y + 26, 30, 3);
    this.label('LANDING ZONE', width / 2, y + 55, '#d5f768', 12, 'center');
  }

  plane(width, clock) {
    const ctx = this.context; const image = this.images.plane;
    ctx.save(); ctx.rotate(this.reducedMotion ? 0 : Math.sin(clock * 1.3) * 0.035);
    if (image.complete && image.naturalWidth) ctx.drawImage(image, -width / 2, -width * 0.2, width, width * 0.4);
    else { ctx.fillStyle = '#274a54'; ctx.fillRect(-width / 2, -8, width, 16); }
    ctx.restore();
  }

  balloon() {
    const ctx = this.context;
    ctx.strokeStyle = '#6e587e'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(-14, 15); ctx.lineTo(-7, 33); ctx.moveTo(14, 15); ctx.lineTo(7, 33); ctx.stroke();
    ctx.fillStyle = '#ad7cd7'; ctx.beginPath(); ctx.ellipse(0, -6, 22, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9cff7'; ctx.beginPath(); ctx.ellipse(0, -6, 8, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#775634'; ctx.fillRect(-8, 30, 16, 10);
  }

  drone(clock) {
    const ctx = this.context;
    ctx.strokeStyle = '#1b424e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-25, -5); ctx.lineTo(25, -5); ctx.stroke();
    ctx.fillStyle = '#1b424e'; ctx.fillRect(-13, -6, 26, 14); ctx.fillStyle = '#d5f768'; ctx.fillRect(-8, -4, 16, 7);
    ctx.strokeStyle = '#395f6a'; ctx.lineWidth = 2;
    const spin = this.reducedMotion ? 10 : 7 + Math.abs(Math.sin(clock * 27)) * 8;
    for (const x of [-25, 25]) { ctx.beginPath(); ctx.ellipse(x, -10, spin, 3, 0, 0, Math.PI * 2); ctx.stroke(); }
  }

  helicopter(x, y, clock) {
    const ctx = this.context; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#234a57'; ctx.beginPath(); ctx.roundRect(-43, -15, 73, 29, 15); ctx.fill();
    ctx.fillStyle = '#cae9eb'; ctx.beginPath(); ctx.roundRect(0, -12, 25, 23, 10); ctx.fill();
    ctx.fillStyle = '#234a57'; ctx.fillRect(-80, -4, 40, 8); ctx.fillRect(-83, -14, 6, 20);
    ctx.fillRect(-25, 14, 5, 11); ctx.fillRect(16, 14, 5, 11); ctx.fillRect(-34, 24, 67, 4);
    const spin = this.reducedMotion ? 64 : 45 + Math.abs(Math.sin(clock * 22)) * 30;
    ctx.fillRect(-spin, -24, spin * 2, 4); ctx.restore();
  }

  diver(width = 65) {
    const ctx = this.context; const image = this.images.diver;
    if (image.complete && image.naturalWidth) ctx.drawImage(image, -width / 2, -width * 0.23, width, width * 0.46);
    else { ctx.fillStyle = '#234a57'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); }
  }

  player(player, y, color) {
    const ctx = this.context; ctx.save(); ctx.translate(player.x, y);
    if (player.status === 'crashed') ctx.globalAlpha = 0.3;
    if (player.chute) {
      const scale = 0.25 + clamp(player.inflate / TUNING.inflate, 0, 1) * 0.75;
      const radius = 53 * (player.safe ? scale : 0.8);
      ctx.strokeStyle = '#355866'; ctx.lineWidth = 1;
      for (const x of [-radius, -radius / 2, radius / 2, radius]) { ctx.beginPath(); ctx.moveTo(x, -70); ctx.lineTo(x / 8, -7); ctx.stroke(); }
      ctx.fillStyle = player.safe ? color : '#f49584'; ctx.beginPath(); ctx.arc(0, -70, radius, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(16,45,54,.3)'; ctx.beginPath(); ctx.ellipse(0, -70, radius / 2, radius, 0, Math.PI, 0); ctx.stroke();
    }
    this.diver(player.chute ? 50 : 65);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 28, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  gauge(player, x, color) {
    const ctx = this.context;
    const top = this.viewHeight > 900 ? 310 : 142, bottom = this.viewHeight - 58;
    ctx.strokeStyle = 'rgba(16,45,54,.2)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    const line = top + WORLD.safeLine / WORLD.ground * (bottom - top);
    ctx.fillStyle = '#c76b58'; ctx.fillRect(x - 7, line - 1, 14, 2);
    const y = top + clamp(player.y / WORLD.ground, 0, 1) * (bottom - top);
    ctx.fillStyle = color; ctx.strokeStyle = '#234a57'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  label(text, x, y, color, size = 11, align = 'left') {
    const ctx = this.context; ctx.font = `600 ${size}px ui-monospace, monospace`; ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
}
