export class FlightAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.music = new Audio(new URL('../public/audio/music.mp3', import.meta.url).href);
    this.music.loop = true;
    this.music.volume = 0.18;
    this.music.preload = 'none';
  }
  unlock() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!this.context && AudioContext) this.context = new AudioContext();
      this.context?.resume().catch(() => {});
      if (this.enabled) this.music.play().catch(() => {});
    } catch { /* A silent game remains fully playable. */ }
  }
  setEnabled(value) {
    this.enabled = value;
    if (value) this.unlock();
    else this.music.pause();
  }
  pause() { this.music.pause(); }
  resume() { if (this.enabled) this.music.play().catch(() => {}); }
  effect(type) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const settings = {
      jump: [640, 260, 0.14, 'sine'], deploy: [230, 760, 0.24, 'triangle'],
      land: [480, 980, 0.3, 'sine'], crash: [110, 35, 0.26, 'sawtooth'],
    }[type];
    if (!settings) return;
    const [start, end, length, wave] = settings;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + length);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(now); oscillator.stop(now + length);
  }
}
